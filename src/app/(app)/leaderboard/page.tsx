// src/app/(app)/leaderboard/page.tsx
//
// The global leaderboard page — shows rankings across all players on the app.
//
// This is a Server Component: it runs on the server, fetches all data from
// the database, crunches the numbers, and passes the finished standings down
// to LeaderboardClient which handles the interactive buttons and sorting.
//
// Data flow:
//   1. For each sport, prefer the is_active season (same as /picks and leagues);
//      if none, use the most recent season with starts_at <= today (offseason).
//   2. Load all scored picks (picks with points_earned filled in) for those seasons
//   3. Compute per-sport and combined "Overall" standings in TypeScript
//   4. Cap at top 100; detect if the logged-in user is outside top 100
//   5. Hand everything to <LeaderboardClient> as props

// revalidate = 180 declares our preferred cache lifetime: re-run after 3 minutes.
// In practice, reading the auth cookie forces dynamic rendering in Next.js 14 —
// this page re-runs on every request regardless of this value. The declaration
// is kept as documented intent for if/when the page moves to an RPC-based
// approach (see Linear: leaderboard standings RPC) that no longer needs the cookie.
export const revalidate = 180

import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import LeaderboardClient from './LeaderboardClient'

// -----------------------------------------------------------------------
// Type definitions — exported so LeaderboardClient.tsx can import them
// -----------------------------------------------------------------------

// One row in the standings table
export type StandingRow = {
  userId:        string
  username:      string
  rank:          number    // 1-based, ties share the same rank number
  totalPoints:   number
  correctPicks:  number    // picks where points_earned > 0
  finishedPicks: number    // all scored picks (points_earned IS NOT NULL)
  accuracy:      number    // 0–100, correct picks ÷ all finished picks (matches league leaderboard)
}

// One sport shown as a pill button
export type SportOption = {
  id:   string
  name: string   // e.g. "College Football"
  slug: string   // e.g. "cfb"
}

// The data for one leaderboard view (one sport or Overall)
export type LeaderboardView = {
  standings: StandingRow[]      // top 100, sorted by totalPoints DESC by default
  pinnedRow: StandingRow | null // current user's row if they're outside the top 100
}

// -----------------------------------------------------------------------
// LeaderboardPage — the server component
// -----------------------------------------------------------------------
export default async function LeaderboardPage() {
  noStore()

  const supabase = createClient()

  // ---- Auth check ----
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Extract user.id here so the computeStandings closure below can use it
  // without TypeScript complaining that user might be null (it narrowed above
  // but closures don't always carry that narrowing through).
  const currentUserId = user.id

  // -----------------------------------------------------------------------
  // Step 1–2: Choose one season per sport for standings.
  //
  // IMPORTANT: /picks and league pages use seasons where is_active = true.
  // The leaderboard used to use only starts_at <= today (most recent start).
  // If the active season's starts_at is still in the future (data quirk) or
  // differs from that row, we were querying the wrong season — new weeks'
  // games and points_earned never appeared on the global board while leagues
  // looked correct.
  //
  // Strategy: prefer is_active per sport (same as the rest of the app).
  // Fallback: most recent season with starts_at <= now (offseason / legacy).
  // -----------------------------------------------------------------------
  const today = new Date().toISOString()

  // Note on the SeasonWithSport type and the `as unknown as` cast used below:
  // Supabase's TypeScript inference doesn't automatically resolve nested FK
  // joins like sports(id, name, slug) into their correct shape — the inferred
  // type doesn't match SeasonWithSport. This double-cast is the standard
  // workaround for this known PostgREST/Supabase limitation. The same pattern
  // is used throughout the codebase (e.g. leagues/[id]/page.tsx).
  type SeasonWithSport = {
    id:        string
    sport_id:  string
    starts_at: string
    sports:    SportOption | null
  }

  const { data: activeRaw, error: activeErr } = await supabase
    .from('seasons')
    .select('id, sport_id, starts_at, sports(id, name, slug)')
    .eq('is_active', true)

  if (activeErr) {
    console.error('[leaderboard] Failed to load active seasons:', activeErr.message)
    return <LeaderboardError />
  }

  const activeSeasons = (activeRaw ?? []) as unknown as SeasonWithSport[]
  const activeBySport = new Map<string, SeasonWithSport>()
  for (const s of activeSeasons) {
    if (!s.sport_id || !s.sports) continue
    const existing = activeBySport.get(s.sport_id)
    if (!existing || new Date(s.starts_at) > new Date(existing.starts_at)) {
      activeBySport.set(s.sport_id, s)
    }
  }

  const { data: startedRaw, error: startedErr } = await supabase
    .from('seasons')
    .select('id, sport_id, starts_at, sports(id, name, slug)')
    .lte('starts_at', today)
    .order('starts_at', { ascending: false })

  if (startedErr) {
    console.error('[leaderboard] Failed to load started seasons:', startedErr.message)
    return <LeaderboardError />
  }

  const allStartedSeasons = (startedRaw ?? []) as unknown as SeasonWithSport[]
  const fallbackBySport = new Map<string, SeasonWithSport>()
  for (const s of allStartedSeasons) {
    if (!s.sport_id || !s.sports) continue
    if (!fallbackBySport.has(s.sport_id)) fallbackBySport.set(s.sport_id, s)
  }

  const allSportIds = Array.from(
    new Set([...Array.from(activeBySport.keys()), ...Array.from(fallbackBySport.keys())])
  )
  const currentSeasons: SeasonWithSport[] = []
  for (const sportId of allSportIds) {
    const chosen = activeBySport.get(sportId) ?? fallbackBySport.get(sportId)
    if (chosen) currentSeasons.push(chosen)
  }

  // Build the ordered list of sport options (for the pill buttons)
  const sports: SportOption[] = currentSeasons
    .map(s => s.sports)
    .filter((s): s is SportOption => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  // ---- Empty state: no seasons have started yet ----
  if (sports.length === 0) {
    return (
      <LeaderboardClient
        sports={[]}
        views={{}}
        currentUserId={currentUserId}
      />
    )
  }

  // -----------------------------------------------------------------------
  // Step 3: Load weeks → games → scored picks for all current seasons.
  //
  // We do this in a chain because each query depends on the previous result:
  //   season IDs → week IDs → game IDs → picks
  // -----------------------------------------------------------------------
  const seasonIds = currentSeasons.map(s => s.id)

  const { data: rawWeeks, error: weeksError } = await supabase
    .from('weeks')
    .select('id, season_id')
    .in('season_id', seasonIds)

  if (weeksError) {
    console.error('[leaderboard] Failed to load weeks:', weeksError.message)
    return <LeaderboardError />
  }

  const weeks = rawWeeks ?? []
  const weekIds = weeks.map(w => w.id)

  // Conditional queries: skip the DB call entirely if the upstream list is empty
  // (an empty .in() clause would be a Supabase error). Fall back to an empty result.
  const gamesResult = weekIds.length > 0
    ? await supabase
        .from('games')
        .select('id, week_id')
        .in('week_id', weekIds)
    : { data: [] as Array<{ id: string; week_id: string }>, error: null }

  if (gamesResult.error) {
    console.error('[leaderboard] Failed to load games:', gamesResult.error.message)
    return <LeaderboardError />
  }

  const games = gamesResult.data ?? []
  const gameIds = games.map(g => g.id)

  // Scored picks only — points_earned IS NOT NULL means the game is final.
  // Because all these games are past kickoff (they're scored), the RLS policy
  // "picks: users can read others after kickoff" allows us to read everyone's picks.
  const picksResult = gameIds.length > 0
    ? await supabase
        .from('picks')
        .select('user_id, game_id, points_earned')
        .in('game_id', gameIds)
        .not('points_earned', 'is', null)
    : { data: [] as Array<{ user_id: string; game_id: string; points_earned: number | null }>, error: null }

  if (picksResult.error) {
    console.error('[leaderboard] Failed to load picks:', picksResult.error.message)
    return <LeaderboardError />
  }

  const allPicks = picksResult.data ?? []

  // ---- Empty state: no games have been scored yet ----
  if (allPicks.length === 0) {
    return (
      <LeaderboardClient
        sports={sports}
        views={Object.fromEntries(
          [...sports.map(s => s.slug), 'overall'].map(slug => [
            slug,
            { standings: [], pinnedRow: null },
          ])
        )}
        currentUserId={currentUserId}
      />
    )
  }

  // -----------------------------------------------------------------------
  // Step 4: Load profiles (usernames) for every user who has a scored pick.
  // -----------------------------------------------------------------------
  const uniqueUserIds = Array.from(new Set(allPicks.map(p => p.user_id)))

  const { data: rawProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', uniqueUserIds)

  if (profilesError) {
    // Non-fatal — standings still render; affected users will show as 'Unknown'
    console.error('[leaderboard] Failed to load profiles:', profilesError.message)
  }

  // Map of userId → username for fast lookup
  const profileById: Record<string, string> = {}
  for (const p of rawProfiles ?? []) {
    profileById[p.id] = p.username
  }

  // -----------------------------------------------------------------------
  // Step 5: Build lookup maps so we can trace each pick back to its sport.
  //
  // Chain: pick.game_id → game.week_id → week.season_id → season.sport_id
  // -----------------------------------------------------------------------
  const weekByGameId: Record<string, string> = {}
  for (const g of games) weekByGameId[g.id] = g.week_id

  const seasonByWeekId: Record<string, string> = {}
  for (const w of weeks) seasonByWeekId[w.id] = w.season_id

  const sportIdBySeasonId: Record<string, string> = {}
  for (const s of currentSeasons) sportIdBySeasonId[s.id] = s.sport_id

  // Group picks by sport ID so per-sport standings are easy to compute
  const picksBySportId: Record<string, typeof allPicks> = {}
  for (const sport of sports) picksBySportId[sport.id] = []

  for (const pick of allPicks) {
    const weekId   = weekByGameId[pick.game_id]
    const seasonId = weekId   ? seasonByWeekId[weekId]       : undefined
    const sportId  = seasonId ? sportIdBySeasonId[seasonId]  : undefined
    if (sportId && picksBySportId[sportId]) {
      picksBySportId[sportId].push(pick)
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Compute standings from a list of picks.
  //
  // This helper is called once per sport and once for "Overall".
  // It sums points, counts correct picks, assigns tie-aware ranks,
  // slices to top 100, and finds the current user's row if they're outside.
  // -----------------------------------------------------------------------
  function computeStandings(
    picks: { user_id: string; points_earned: number | null }[]
  ): LeaderboardView {
    // Accumulate stats per user
    const statsById: Record<string, {
      totalPoints:   number
      correctPicks:  number  // picks where points_earned > 0
      finishedPicks: number  // all scored picks including push/void
    }> = {}

    for (const pick of picks) {
      if (!statsById[pick.user_id]) {
        statsById[pick.user_id] = {
          totalPoints: 0, correctPicks: 0, finishedPicks: 0,
        }
      }
      // points_earned is NUMERIC in the DB — convert to JS number with Number()
      const pts = Number(pick.points_earned ?? 0)
      statsById[pick.user_id].totalPoints   += pts
      statsById[pick.user_id].finishedPicks += 1
      if (pts > 0) statsById[pick.user_id].correctPicks += 1
    }

    // Anyone with at least one scored pick appears (including negative totals
    // from double-down losses). Only hide users who have no finished games yet.
    const sorted = Object.entries(statsById)
      .filter(([, stats]) => stats.finishedPicks >= 1)
      .sort(([, a], [, b]) => b.totalPoints - a.totalPoints)

    // Assign tie-aware ranks: players with equal points share the same rank number
    let currentRank = 1
    const allRows: StandingRow[] = sorted.map(([userId, stats], i) => {
      if (i > 0 && stats.totalPoints < sorted[i - 1][1].totalPoints) {
        currentRank = i + 1
      }

      // Accuracy = correct wins ÷ all finished picks.
      // Matches the league leaderboard formula — push/void games count as
      // finished but not correct, so they lower accuracy like a wrong pick.
      const accuracy = stats.finishedPicks > 0
        ? Math.round((stats.correctPicks / stats.finishedPicks) * 100)
        : 0

      return {
        userId,
        username:      profileById[userId] ?? 'Unknown',
        rank:          currentRank,
        totalPoints:   stats.totalPoints,
        correctPicks:  stats.correctPicks,
        finishedPicks: stats.finishedPicks,
        accuracy,
      }
    })

    // Top 100 cap
    const standings = allRows.slice(0, 100)

    // Pinned row: only set if the current user is NOT in the top 100
    const inTop100 = standings.some(r => r.userId === currentUserId)
    const pinnedRow = inTop100
      ? null
      : (allRows.find(r => r.userId === currentUserId) ?? null)

    return { standings, pinnedRow }
  }

  // -----------------------------------------------------------------------
  // Step 7: Build a LeaderboardView for each sport and for "Overall".
  //
  // views is a plain object keyed by sport slug (e.g. "cfb") or "overall".
  // The client component selects which view to render based on the active pill.
  // -----------------------------------------------------------------------
  const views: Record<string, LeaderboardView> = {}

  for (const sport of sports) {
    views[sport.slug] = computeStandings(picksBySportId[sport.id] ?? [])
  }

  // Overall: pool every scored pick from every sport into one combined ranking
  views['overall'] = computeStandings(allPicks)

  return (
    <LeaderboardClient
      sports={sports}
      views={views}
      currentUserId={currentUserId}
    />
  )
}

// -----------------------------------------------------------------------
// LeaderboardError
//
// Shown when a critical Supabase query fails (network error, RLS issue, etc.)
// The specific error is logged server-side via console.error above.
// -----------------------------------------------------------------------
function LeaderboardError() {
  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-brand-500 text-2xl font-bold tracking-tight">Leaderboard</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-white font-bold text-xl mb-2">Couldn&apos;t Load Leaderboard</h2>
        <p className="text-zinc-500 text-sm max-w-xs">
          Something went wrong loading the standings. Please refresh and try again.
        </p>
      </div>
    </div>
  )
}
