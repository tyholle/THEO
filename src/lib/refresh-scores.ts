// src/lib/refresh-scores.ts
// Core score-refresh logic, shared between:
//   - The admin "Refresh Scores" button (scores.ts server action)
//   - The automatic cron job (/api/cron/refresh-scores)
//
// This file only contains the data-fetching and scoring logic.
// It accepts any Supabase client so the caller decides whether to
// use the regular client (admin-verified) or the service-role client (cron).

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchScoresByDate, fetchGameById, toEspnDate, type EspnGame } from '@/lib/espn'
import { calculateAtsResult, calculatePointsEarned } from '@/lib/scoring'

// -----------------------------------------------------------------------
// scoreGame
// Given a game that just became "final", calculate the ATS result and
// write points_earned to every pick for that game.
//
// Exported so manualScoreOverride in scores.ts can use the same logic —
// one implementation means a bug fix here fixes both paths automatically.
// -----------------------------------------------------------------------
export async function scoreGame(
  supabase: SupabaseClient,
  gameId: string,
  homeScore: number,
  awayScore: number,
  spread: number,
  spreadFavors: 'home' | 'away',
  pointValue: number,
  teamColors?: { home: string | null; away: string | null } | null
) {
  const atsResult = calculateAtsResult(homeScore, awayScore, spread, spreadFavors)

  const update: Record<string, string | number | null> = {
    ats_result: atsResult,
    home_score: homeScore,
    away_score: awayScore,
    status: 'final',
  }
  if (teamColors) {
    if (teamColors.home) update.home_team_color = teamColors.home
    if (teamColors.away) update.away_team_color = teamColors.away
  }

  const { error: gameError } = await supabase
    .from('games')
    .update(update)
    .eq('id', gameId)

  if (gameError) throw new Error(`Failed to update game ats_result: ${gameError.message}`)

  const { data: picks, error: picksError } = await supabase
    .from('picks')
    .select('id, picked_team, is_double_down')
    .eq('game_id', gameId)

  if (picksError) throw new Error(`Failed to fetch picks: ${picksError.message}`)
  if (!picks || picks.length === 0) return

  const updates = picks.map((pick: { id: string; picked_team: 'home' | 'away'; is_double_down: boolean }) => {
    const points = calculatePointsEarned(pick.picked_team, pick.is_double_down, atsResult, pointValue)
    return supabase.from('picks').update({ points_earned: points }).eq('id', pick.id)
  })

  const results = await Promise.all(updates)
  const failures = results.filter(r => r.error)
  if (failures.length > 0) {
    throw new Error(`Failed to score ${failures.length} pick(s): ${failures.map(r => r.error!.message).join(', ')}`)
  }
}

// -----------------------------------------------------------------------
// runRefreshScores
// The main refresh function. Pass any Supabase client — the admin client
// (from requireAdmin) or the service-role client (from createAdminClient).
//
// Returns an object with { updatedCount, scoredCount, failedCount }.
// -----------------------------------------------------------------------
export async function runRefreshScores(supabase: SupabaseClient) {
  // Get all active seasons with their sport slug in one query.
  // seasons.sport_id is a FK to sports.id (many-to-one), so PostgREST
  // returns sports as an embedded object: { slug: 'mlb' }
  const { data: activeSeasons, error: seasonsError } = await supabase
    .from('seasons')
    .select('id, sports(slug)')
    .eq('is_active', true)

  if (seasonsError) throw new Error(`Failed to fetch active seasons: ${seasonsError.message}`)
  if (!activeSeasons || activeSeasons.length === 0) {
    return { updatedCount: 0, scoredCount: 0, failedCount: 0, message: 'No active seasons.' }
  }

  let updatedCount = 0
  let scoredCount  = 0
  const failedGameIds: string[] = []

  for (const season of activeSeasons) {
    // PostgREST returns many-to-one joins as an object, so sports is { slug: 'mlb' }
    // Supabase's inference doesn't resolve the nested sports shape, so we cast
    // with an explicit type instead of the unsafe `as any` shortcut.
    type SeasonWithSport = { id: string; sports: { slug: string } | null }
    const sportSlug: string = (season as unknown as SeasonWithSport)?.sports?.slug ?? 'cfb'

    // Get ALL non-complete weeks for this sport (not just the first one).
    // Previously this only looked at the first non-complete week, which meant
    // games in Week 2, 3, etc. would never be refreshed if earlier weeks
    // hadn't been marked complete by the admin.
    const { data: nonCompleteWeeks } = await supabase
      .from('weeks')
      .select('id')
      .eq('season_id', season.id)
      .eq('is_complete', false)
      .order('week_number', { ascending: true })

    if (!nonCompleteWeeks || nonCompleteWeeks.length === 0) continue // All weeks complete

    const weekIds = nonCompleteWeeks.map(w => w.id)

    // Get all games across all non-complete weeks that have an ESPN ID
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, espn_game_id, kickoff_at, status, spread, spread_favors, point_value')
      .in('week_id', weekIds)
      .not('espn_game_id', 'is', null)

    if (gamesError || !games || games.length === 0) continue

    // Collect unique Eastern-time dates for this sport's games
    const dateSet = new Set<string>()
    for (const game of games) {
      dateSet.add(toEspnDate(game.kickoff_at))
    }

    // Fetch ESPN scoreboard for each date (sport-specific endpoint)
    const espnMap = new Map<string, EspnGame>()
    for (const date of Array.from(dateSet)) {
      const espnGames = await fetchScoresByDate(date, sportSlug)
      for (const eg of espnGames) {
        espnMap.set(eg.espnGameId, eg)
      }
    }

    // Match each stored game to its ESPN result and update the DB
    for (const game of games) {
      if (game.status === 'final' || game.status === 'void') continue

      try {
        let espnGame = espnMap.get(game.espn_game_id)

        // Fallback: fetch the individual game summary if not in scoreboard
        if (!espnGame) {
          espnGame = await fetchGameById(game.espn_game_id, sportSlug) ?? undefined
        }

        if (!espnGame) continue

        const newStatus = espnGame.status
        const homeScore = espnGame.homeScore
        const awayScore = espnGame.awayScore

        if (newStatus === 'final' && homeScore !== null && awayScore !== null) {
          // Game just finished — calculate ATS and award points
          await scoreGame(
            supabase,
            game.id,
            homeScore,
            awayScore,
            game.spread,
            game.spread_favors,
            game.point_value,
            { home: espnGame.homeTeamColor, away: espnGame.awayTeamColor }
          )
          scoredCount++
        } else {
          // Still in progress or scheduled — update scores, status, and team colors from ESPN
          const { error: updateError } = await supabase
            .from('games')
            .update({
              home_score: homeScore,
              away_score: awayScore,
              status: newStatus,
              ...(espnGame.homeTeamColor != null && { home_team_color: espnGame.homeTeamColor }),
              ...(espnGame.awayTeamColor != null && { away_team_color: espnGame.awayTeamColor }),
            })
            .eq('id', game.id)

          if (updateError) {
            console.error(`Failed to update game ${game.id}:`, updateError)
            failedGameIds.push(game.id)
            continue
          }
        }

        updatedCount++
      } catch (gameErr) {
        console.error(`Error processing game ${game.id}:`, gameErr)
        failedGameIds.push(game.id)
      }
    }
  }

  // -----------------------------------------------------------------------
  // Recovery pass: re-score any game already marked "final" that still has
  // picks with points_earned = null.
  //
  // This handles the case where a previous refresh run was interrupted
  // mid-way (e.g. server crash, timeout) after the game row was set to
  // "final" but before all pick rows were updated with points_earned.
  // Without this pass, those picks would stay at null forever because the
  // main loop skips games already marked "final" (line 131 above).
  //
  // We run this after the main loop so it acts as a safety net — it only
  // fires if something actually went wrong in a prior run.
  // -----------------------------------------------------------------------
  let recoveredCount = 0

  for (const season of activeSeasons) {
    // Find all weeks in this season
    const { data: allWeeks } = await supabase
      .from('weeks')
      .select('id')
      .eq('season_id', season.id)

    if (!allWeeks || allWeeks.length === 0) continue
    const allWeekIds = allWeeks.map(w => w.id)

    // Find final games in this season that have at least one un-scored pick
    const { data: finalGames } = await supabase
      .from('games')
      .select('id, spread, spread_favors, point_value, home_score, away_score')
      .in('week_id', allWeekIds)
      .eq('status', 'final')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)

    if (!finalGames || finalGames.length === 0) continue

    for (const game of finalGames) {
      // Check if any pick for this game is still un-scored
      const { data: unscoredPicks } = await supabase
        .from('picks')
        .select('id')
        .eq('game_id', game.id)
        .is('points_earned', null)
        .limit(1)

      if (!unscoredPicks || unscoredPicks.length === 0) continue

      // At least one pick is missing — re-run scoreGame for the whole game.
      // scoreGame is safe to run multiple times: it overwrites points_earned
      // with the correct value, so already-scored picks get the same value again.
      try {
        await scoreGame(
          supabase,
          game.id,
          game.home_score!,
          game.away_score!,
          game.spread,
          game.spread_favors,
          game.point_value
        )
        recoveredCount++
      } catch (recoverErr) {
        console.error(`Recovery scoring failed for game ${game.id}:`, recoverErr)
        failedGameIds.push(game.id)
      }
    }
  }

  const failedCount = failedGameIds.length
  const failureNote   = failedCount    > 0 ? ` ${failedCount} game(s) failed.`     : ''
  const recoveryNote  = recoveredCount > 0 ? ` Recovered ${recoveredCount} game(s).` : ''
  const message       = `Updated ${updatedCount} game(s). Scored ${scoredCount} final game(s).${recoveryNote}${failureNote}`

  return { updatedCount, scoredCount, failedCount, message }
}
