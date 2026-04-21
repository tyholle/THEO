// src/app/picks/page.tsx
//
// The picks page server component — this runs on the server before the
// page is sent to the user's browser.
//
// "Server Component" means: it can securely talk to the database, it
// fetches all necessary data, and then passes that data as props to the
// interactive client components below. The user's browser never runs
// this code — it only sees the finished HTML and the client components.
//
// This file is the entry point at /picks. It:
//   1. Confirms the user is logged in (redirect to /auth if not)
//   2. Finds the active season and its sport name
//   3. Loads all weeks for that season
//   4. Figures out which week to show (from URL ?week=N, or current week)
//   5. Loads the games for that week
//   6. Loads the user's existing picks for that week
//   7. Renders <PicksClient> with all of this as props

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PicksClient from './PicksClient'

// -----------------------------------------------------------------------
// Type definitions
// These describe exactly what shape the data is when it comes out of
// the database. Think of them as a contract: "the DB gives us this."
// -----------------------------------------------------------------------

export type WeekRow = {
  id: string
  week_number: number
  label: string         // e.g. "Week 1" — set by admin
  is_complete: boolean  // true once all games in this week have been scored
}

export type GameRow = {
  id: string
  week_id: string
  home_team: string               // Full team name (fallback)
  away_team: string
  home_short_name: string | null  // Short name from ESPN e.g. "Ohio State"
  away_short_name: string | null
  home_logo_url: string | null    // ESPN CDN logo image URL
  away_logo_url: string | null
  spread: number                  // Always negative, e.g. -7.5
  spread_favors: 'home' | 'away'  // Which team that negative spread applies to
  point_value: number             // 1–10, admin-assigned
  kickoff_at: string              // ISO timestamp
  home_score: number | null       // null until game starts
  away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final' | 'void'
  ats_result: string | null       // 'home', 'away', 'push', 'void', or null
}

export type PickRow = {
  id: string
  user_id: string
  game_id: string
  week_id: string
  picked_team: 'home' | 'away'
  is_double_down: boolean
  points_earned: number | null    // null until the game is scored
}

// -----------------------------------------------------------------------
// PicksPage
// The server component. searchParams is how Next.js passes URL query
// parameters to a page, e.g. /picks?week=3 gives us { week: '3' }.
// -----------------------------------------------------------------------
// A sport entry used in the sport-switcher row
export type SportEntry = { id: string; name: string; slug: string }

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; sport?: string }>
}) {
  const supabase = createClient()

  // ---- Auth check ----
  // Make sure the user is logged in. If not, send them to the login page.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // We join seasons → sports in one query so we don't need a second round-trip.
  // When CFB and NFL are both active this returns two rows; when only one is
  // active it returns one row — either way the code below handles it.
  // We cast to SeasonWithSport because Supabase's generated types don't
  // automatically know the shape of nested joins without codegen.
  type SeasonWithSport = { id: string; sport_id: string; sports: SportEntry | null }
  const { data: rawSeasons } = await supabase
    .from('seasons')
    .select('id, sport_id, sports(id, name, slug)')
    .eq('is_active', true)
  const activeSeasons = (rawSeasons ?? []) as unknown as SeasonWithSport[]

  if (activeSeasons.length === 0) {
    return <NoSeasonState />
  }

  // ---- Resolve which sport to display ----
  // If the URL has ?sport=nfl, show NFL. Otherwise default to the first active sport.
  const params = await searchParams
  const sportParam = params.sport?.toLowerCase() ?? null

  const season = (sportParam
    ? activeSeasons.find(s => s.sports?.slug === sportParam)
    : null
  ) ?? activeSeasons[0]

  // Extract the sport name and slug from the joined data
  const sportInfo  = season.sports
  const sportName  = sportInfo?.name ?? 'College Football'
  const sportSlug  = sportInfo?.slug ?? 'cfb'

  // Build the list of active sports for the sport-switcher row
  const allActiveSports: SportEntry[] = activeSeasons
    .map(s => s.sports)
    .filter((s): s is SportEntry => s !== null)
  const showSportRow = allActiveSports.length >= 2

  // ---- Fetch weeks for the selected sport's season ----
  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, week_number, label, is_complete')
    .eq('season_id', season.id)
    .order('week_number', { ascending: true })

  const allWeeks: WeekRow[] = weeks ?? []

  // ---- Determine which week to display ----
  // 1. If the URL has ?week=3, use week 3.
  // 2. Otherwise, use the most recent week that isn't complete yet.
  // 3. If all weeks are complete, show the last week.
  const weekParam = params.week ? parseInt(params.week, 10) : null

  // "Current week" = first week that isn't complete yet (or the last one)
  const currentWeek =
    allWeeks.find(w => !w.is_complete) ??
    allWeeks[allWeeks.length - 1]

  // Find the week matching the URL param, or fall back to current week
  const selectedWeek =
    (weekParam ? allWeeks.find(w => w.week_number === weekParam) : null) ??
    currentWeek

  // If there are no weeks at all, show the empty state
  if (!selectedWeek) {
    return <NoWeeksState sportName={sportName} />
  }

  // ---- Fetch games for the selected week ----
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, week_id, home_team, away_team, home_short_name, away_short_name, home_logo_url, away_logo_url, spread, spread_favors, point_value, kickoff_at, home_score, away_score, status, ats_result')
    .eq('week_id', selectedWeek.id)
    .order('kickoff_at', { ascending: true })

  if (gamesError) return <DatabaseErrorState />

  // ---- Fetch picks by game ID, not week ID ----
  // We fetch picks using the exact game IDs on this page rather than
  // filtering by week_id. This is more reliable: the pick's week_id
  // may differ from selectedWeek.id in some edge cases (e.g. set by a
  // DB trigger), but the game_id relationship is always canonical.
  const gameIds = (games ?? []).map(g => g.id)

  const { data: picks, error: picksError } = gameIds.length > 0
    ? await supabase
        .from('picks')
        .select('*')
        .in('game_id', gameIds)
        .eq('user_id', user.id)
    : { data: [], error: null }

  if (picksError) return <DatabaseErrorState />

  // ---- Render the interactive client component ----
  // We pass everything as props. The client component takes over from here
  // for all user interactions (clicking teams, double down, etc.)
  return (
    <PicksClient
      userId={user.id}
      sportSlug={sportSlug}
      allActiveSports={allActiveSports}
      showSportRow={showSportRow}
      weeks={allWeeks}
      selectedWeekNumber={selectedWeek.week_number}
      games={(games ?? []) as GameRow[]}
      initialPicks={(picks ?? []) as PickRow[]}
    />
  )
}

// -----------------------------------------------------------------------
// Helper: shown when the games or picks database query fails.
// Better than silently showing an empty slate, which is confusing and
// makes database errors indistinguishable from "no games added yet."
// -----------------------------------------------------------------------
function DatabaseErrorState() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 pb-24">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-white font-bold text-xl mb-2">Something Went Wrong</h2>
      <p className="text-zinc-500 text-sm text-center max-w-xs">
        We couldn&apos;t load the games right now. Please refresh the page and try again.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------
// Helper: empty state when there's no active season in the database.
// The admin needs to create and activate a season first.
// -----------------------------------------------------------------------
function NoSeasonState() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 pb-24">
      <div className="text-4xl mb-4">🏈</div>
      <h2 className="text-white font-bold text-xl mb-2">No Active Season</h2>
      <p className="text-zinc-500 text-sm text-center max-w-xs">
        An admin needs to create and activate a season before picks can be made.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------
// Helper: empty state when a season exists but has no weeks yet.
// -----------------------------------------------------------------------
function NoWeeksState({ sportName }: { sportName: string; showSportRow?: boolean }) {
  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <div className="px-5 pt-12 pb-6">
        <h1 className="text-brand-500 text-2xl font-bold tracking-tight">
          {sportName} Picks
        </h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-4xl mb-4">📅</div>
        <h2 className="text-white font-bold text-xl mb-2">New Slate Coming Soon...</h2>
        <p className="text-zinc-500 text-sm text-center max-w-xs">
          Check back soon — games will appear here once the week is set up.
        </p>
      </div>
    </div>
  )
}
