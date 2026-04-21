// src/app/(app)/leagues/[id]/page.tsx
//
// The league detail page — shown when a user taps a league card.
// This is a Server Component.
//
// What it does:
//   1. Confirms the user is logged in + is a member of this league
//      (redirects to /leagues if either check fails)
//   2. Loads league info, all members, the active season, all weeks,
//      all season games, and all picks by members
//   3. Pre-computes the overall standings (season totals + accuracy)
//      from the picks data
//   4. Filters games and picks for whichever week is selected
//      (from ?week=N URL param, or defaults to the current active week)
//   5. Passes everything to LeagueDetailClient for tab-based display
//
// The ?week=N param is changed by the week-selector pills in LeaderboardTab.
// Changing the week re-runs this server component to get fresh data.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LeagueDetailClient from './LeagueDetailClient'

// Always fetch fresh — member list and standings must reflect the latest DB state.
export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------
// Type definitions — exported so child components can import them
// -----------------------------------------------------------------------

export type LeagueMember = {
  userId:   string
  username: string
  role:     'owner' | 'member'
  joinedAt: string
}

export type OverallStanding = {
  userId:       string
  username:     string
  totalPoints:  number
  correctPicks: number
  finishedPicks: number
  accuracy:     number   // 0–100 (percentage)
  rank:         number
}

export type LeagueGame = {
  id:              string
  week_id:         string
  home_team:       string
  away_team:       string
  home_short_name: string | null
  away_short_name: string | null
  home_logo_url:   string | null
  away_logo_url:   string | null
  spread:          number
  spread_favors:   'home' | 'away'
  point_value:     number
  kickoff_at:      string   // ISO timestamp
  home_score:      number | null
  away_score:      number | null
  status:          string
  ats_result:      string | null
}

export type LeaguePick = {
  user_id:        string
  game_id:        string
  picked_team:    'home' | 'away'
  is_double_down: boolean
  points_earned:  number | null
}

export type LeagueWeek = {
  id:          string
  week_number: number
  label:       string
  is_complete: boolean
}

// -----------------------------------------------------------------------
// LeagueDetailPage — server component
// -----------------------------------------------------------------------
export default async function LeagueDetailPage({
  params,
  searchParams,
}: {
  params:       { id: string }
  searchParams: Promise<{ week?: string }>
}) {
  const supabase = createClient()

  // ---- Auth ----
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // ---- Load league info ----
  // We do NOT use the PostgREST sports(name) FK join here because Supabase's
  // internal schema cache can lag after migrations and silently return null
  // for the join instead of throwing an error. We fetch sports separately.
  const { data: rawGroup } = await supabase
    .from('groups')
    .select('id, name, join_code, sport_id')
    .eq('id', params.id)
    .eq('is_active', true)
    .maybeSingle()

  // League doesn't exist or was deactivated
  if (!rawGroup) redirect('/leagues')

  const group = rawGroup

  // Fetch sport name separately to avoid schema cache issues
  let sportName = 'Unknown Sport'
  if (rawGroup.sport_id) {
    const { data: sport } = await supabase
      .from('sports')
      .select('name')
      .eq('id', rawGroup.sport_id)
      .maybeSingle()
    if (sport) sportName = sport.name
  }

  // ---- Load all members + their profiles ----
  const { data: rawMembers } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at, profiles(username)')
    .eq('group_id', params.id)

  const members: LeagueMember[] = (rawMembers ?? []).map(m => ({
    userId:   m.user_id,
    username: (m.profiles as { username: string } | null)?.username ?? 'Unknown',
    role:     m.role as 'owner' | 'member',
    joinedAt: m.joined_at,
  }))

  // ---- Verify current user is a member ----
  // Non-members who navigate directly to this URL get redirected.
  const myMembership = members.find(m => m.userId === user.id)
  if (!myMembership) redirect('/leagues')

  const isOwner = myMembership.role === 'owner'

  // ---- Load active season for this sport ----
  // Without a season there are no weeks or games to show.
  const { data: season } = group.sport_id
    ? await supabase
        .from('seasons')
        .select('id')
        .eq('sport_id', group.sport_id)
        .eq('is_active', true)
        .maybeSingle()
    : { data: null }

  // ---- Load weeks for the season ----
  const { data: rawWeeks } = season
    ? await supabase
        .from('weeks')
        .select('id, week_number, label, is_complete')
        .eq('season_id', season.id)
        .order('week_number', { ascending: true })
    : { data: [] }

  const weeks: LeagueWeek[] = (rawWeeks ?? []) as LeagueWeek[]

  // ---- Determine selected week ----
  // Default: first non-complete week; if all complete, the last week.
  const sp        = await searchParams
  const weekParam = sp.week ? parseInt(sp.week, 10) : null
  const currentWeek =
    weeks.find(w => !w.is_complete) ?? weeks[weeks.length - 1] ?? null
  const selectedWeek =
    (weekParam ? weeks.find(w => w.week_number === weekParam) : null) ?? currentWeek

  // ---- Load ALL games for the entire season ----
  // We fetch all at once so we can use them for both:
  //   • The overall standings (all picks across the season)
  //   • The selected week's display
  const weekIds = weeks.map(w => w.id)

  const { data: rawAllGames } = weekIds.length > 0
    ? await supabase
        .from('games')
        .select('id, week_id, home_team, away_team, home_short_name, away_short_name, home_logo_url, away_logo_url, spread, spread_favors, point_value, kickoff_at, home_score, away_score, status, ats_result')
        .in('week_id', weekIds)
        .order('kickoff_at', { ascending: true })
    : { data: [] }

  const allGames: LeagueGame[] = (rawAllGames ?? []) as LeagueGame[]

  // ---- Load ALL picks by league members across ALL season games ----
  // RLS automatically limits what we can see:
  //   • Our own picks: always visible
  //   • Other members' picks: only after that game's kickoff_at
  // For the overall standings this is fine (scored games are always past kickoff).
  // For the weekly display, the component handles showing a lock icon
  // when a pick isn't visible yet (pre-kickoff other member pick).
  const allGameIds  = allGames.map(g => g.id)
  const memberIds   = members.map(m => m.userId)

  const { data: rawAllPicks } = allGameIds.length > 0 && memberIds.length > 0
    ? await supabase
        .from('picks')
        .select('user_id, game_id, picked_team, is_double_down, points_earned')
        .in('game_id', allGameIds)
        .in('user_id', memberIds)
    : { data: [] }

  const allPicks: LeaguePick[] = (rawAllPicks ?? []) as LeaguePick[]

  // ---- Compute overall standings ----
  // For each member: sum their scored picks (points_earned ≠ null),
  // count correct picks (points_earned > 0), calculate accuracy %.
  // Sort by total points descending, assign ranks (ties share rank).

  const rawStandings = members.map(member => {
    // Only count picks that have been scored (game is finished)
    const scored      = allPicks.filter(p => p.user_id === member.userId && p.points_earned !== null)
    const totalPoints  = scored.reduce((sum, p) => sum + (p.points_earned ?? 0), 0)
    const finishedPicks = scored.length
    const correctPicks  = scored.filter(p => (p.points_earned ?? 0) > 0).length
    const accuracy      = finishedPicks > 0
      ? Math.round((correctPicks / finishedPicks) * 100)
      : 0
    return { ...member, totalPoints, finishedPicks, correctPicks, accuracy, rank: 0 }
  }).sort((a, b) => b.totalPoints - a.totalPoints)

  // Assign ranks — tied players share the same rank number
  let currentRank = 1
  const overallStandings: OverallStanding[] = rawStandings.map((s, i) => {
    if (i > 0 && s.totalPoints < rawStandings[i - 1].totalPoints) currentRank = i + 1
    return { ...s, rank: currentRank }
  })

  // ---- Filter games and picks for the selected week ----
  // The server does this so we avoid sending the full season's data to the client.
  const selectedWeekGames = selectedWeek
    ? allGames.filter(g => g.week_id === selectedWeek.id)
    : []
  const selectedWeekGameIds = new Set(selectedWeekGames.map(g => g.id))
  const selectedWeekPicks   = allPicks.filter(p => selectedWeekGameIds.has(p.game_id))

  // ---- Render ----
  return (
    <LeagueDetailClient
      league={{
        id:        group.id,
        name:      group.name,
        joinCode:  group.join_code,
        sportName,
      }}
      currentUserId={user.id}
      isOwner={isOwner}
      members={members}
      weeks={weeks}
      selectedWeekNumber={selectedWeek?.week_number ?? null}
      selectedWeekGames={selectedWeekGames}
      selectedWeekPicks={selectedWeekPicks}
      overallStandings={overallStandings}
      hasSeason={season !== null}
    />
  )
}
