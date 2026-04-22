// src/app/(app)/leagues/page.tsx
//
// The Leagues hub — the first page users see when they tap "Leagues"
// in the bottom nav. This is a Server Component.
//
// What it does:
//   1. Confirms the user is logged in (redirects to /auth if not)
//   2. Loads all leagues the user belongs to
//   3. For each league, calculates the user's overall season rank
//      (how they rank among members by total points earned)
//   4. Loads the list of active sports for the Create League form
//   5. Passes all of this to LeaguesHubClient, which handles the
//      interactive Create League and Join League flows

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LeaguesHubClient from './LeaguesHubClient'

// Force this page to always run fresh on the server — never serve a cached version.
// Without this, Next.js can serve a stale hub from its navigation cache right after
// you create or join a league, making it look like the league didn't save.
export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------
// Type definitions — exported so other files can import them
// -----------------------------------------------------------------------

// One item in the hub's league list
export type LeagueHubItem = {
  id:          string
  name:        string
  sportName:   string
  sportId:     string | null
  memberCount: number
  rank:        number | null  // null if no picks yet or no active season
  joinCode:    string
  myRole:      'owner' | 'member'
}

// A sport shown in the Create League dropdown
export type ActiveSport = {
  id:   string
  name: string
}

// -----------------------------------------------------------------------
// LeaguesPage — the server component
// -----------------------------------------------------------------------
export default async function LeaguesPage() {
  const supabase = createClient()

  // ---- Auth check ----
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // ---- Step 1: Get all group IDs the user belongs to ----
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', user.id)

  const groupIds = (memberships ?? []).map(m => m.group_id)

  // ---- Step 2: Load those groups (without the sports join) ----
  // We do a separate sports lookup below instead of relying on PostgREST's FK join.
  // This avoids a silent failure when PostgREST's schema cache hasn't refreshed
  // after the migration that added the sport_id column.
  const { data: rawGroups } = groupIds.length > 0
    ? await supabase
        .from('groups')
        .select('id, name, join_code, sport_id, max_members')
        .in('id', groupIds)
        .eq('is_active', true)
    : { data: [] }

  const groups = rawGroups ?? []

  // ---- Step 2b: Load sport names separately ----
  const sportIds = Array.from(new Set(groups.map(g => g.sport_id).filter((id): id is string => id !== null)))
  const { data: rawSports } = sportIds.length > 0
    ? await supabase.from('sports').select('id, name').in('id', sportIds)
    : { data: [] }
  const sportNameById: Record<string, string> = {}
  for (const s of rawSports ?? []) sportNameById[s.id] = s.name

  // ---- Step 3: Load all members for each league (for member count + rank) ----
  const { data: allMembers } = groupIds.length > 0
    ? await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
    : { data: [] }

  // ---- Step 4: Load active sports for the Create League dropdown ----
  const { data: rawActiveSports } = await supabase
    .from('sports')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const activeSports: ActiveSport[] = (rawActiveSports ?? []).map(s => ({
    id:   s.id,
    name: s.name,
  }))

  // ---- Step 5: Compute overall rank for each league ----
  // To show rank, we need: active season → weeks → games → picks per member.
  // We batch by unique sport to avoid redundant queries.

  // Collect all unique sport IDs across the user's leagues
  const uniqueSportIds = Array.from(
    new Set(groups.map(g => g.sport_id).filter((id): id is string => id !== null))
  )

  // For each sport, find its active season ID
  const seasonBySport: Record<string, string> = {}
  await Promise.all(
    uniqueSportIds.map(async sportId => {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('sport_id', sportId)
        .eq('is_active', true)
        .maybeSingle()
      if (season) seasonBySport[sportId] = season.id
    })
  )

  // For each season, find all game IDs (through weeks)
  const gameIdsBySport: Record<string, string[]> = {}
  await Promise.all(
    Object.entries(seasonBySport).map(async ([sportId, seasonId]) => {
      const { data: weeks } = await supabase
        .from('weeks')
        .select('id')
        .eq('season_id', seasonId)
      const weekIds = (weeks ?? []).map(w => w.id)
      if (weekIds.length === 0) return

      const { data: games } = await supabase
        .from('games')
        .select('id')
        .in('week_id', weekIds)
      gameIdsBySport[sportId] = (games ?? []).map(g => g.id)
    })
  )

  // For each league, calculate user's rank among members
  const leagues: LeagueHubItem[] = await Promise.all(
    groups.map(async group => {
      const membership  = (memberships ?? []).find(m => m.group_id === group.id)
      const members     = (allMembers ?? []).filter(m => m.group_id === group.id)
      const memberIds   = members.map(m => m.user_id)
      const gameIds     = group.sport_id ? (gameIdsBySport[group.sport_id] ?? []) : []

      let rank: number | null = null

      if (gameIds.length > 0 && memberIds.length > 0) {
        // Fetch all scored picks by league members across the season
        const { data: picks } = await supabase
          .from('picks')
          .select('user_id, points_earned')
          .in('game_id', gameIds)
          .in('user_id', memberIds)
          .not('points_earned', 'is', null)

        // Sum points per member, default to 0
        const totals: Record<string, number> = {}
        for (const mid of memberIds) totals[mid] = 0
        for (const p of picks ?? []) {
          totals[p.user_id] = (totals[p.user_id] ?? 0) + Number(p.points_earned ?? 0)
        }

        // Sort by total points (desc), then assign tie-aware ranks.
        // Two players with the same points share the same rank number —
        // consistent with how the detail page leaderboard works.
        const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a)
        let currentRank = 1
        for (let i = 0; i < sorted.length; i++) {
          if (i > 0 && sorted[i][1] < sorted[i - 1][1]) currentRank = i + 1
          if (sorted[i][0] === user.id) { rank = currentRank; break }
        }
      }

      return {
        id:          group.id,
        name:        group.name,
        sportName:   group.sport_id ? (sportNameById[group.sport_id] ?? 'Unknown Sport') : 'Unknown Sport',
        sportId:     group.sport_id ?? null,
        memberCount: members.length,
        rank,
        joinCode:    group.join_code,
        myRole:      (membership?.role ?? 'member') as 'owner' | 'member',
      }
    })
  )

  return (
    <LeaguesHubClient
      leagues={leagues}
      activeSports={activeSports}
    />
  )
}
