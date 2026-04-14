'use server'
// src/app/admin/actions/scores.ts
// Server Actions for Section 3: Score Management.
//
// Two main actions:
//   1. refreshScores — fetches live ESPN data for all games in the current week
//   2. manualScoreOverride — admin manually enters scores for a game
//
// Both actions trigger ATS and points calculation the moment a game goes "final".
//
// KEY TERMS:
//   ATS = Against The Spread. Who "covered" — the favorite won by enough,
//         or the underdog kept it close.
//   margin = home_score - away_score (positive = home winning, negative = away winning)
//   line = Math.abs(spread), e.g. 7.5

import { revalidatePath } from 'next/cache'
import { fetchScoresByDate, fetchGameById, toEspnDate, type EspnGame } from '@/lib/espn'
import { calculateAtsResult, calculatePointsEarned } from '@/lib/scoring'
import { requireAdmin } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

// -----------------------------------------------------------------------
// scoreGame
// Internal helper: given a game that just became "final", calculate the
// ATS result and write points_earned to every pick for that game.
// Called automatically during refreshScores and manualScoreOverride.
// -----------------------------------------------------------------------
async function scoreGame(
  supabase: SupabaseClient,
  gameId: string,
  homeScore: number,
  awayScore: number,
  spread: number,
  spreadFavors: 'home' | 'away',
  pointValue: number
) {
  // Step 1: Calculate who covered the spread
  const atsResult = calculateAtsResult(homeScore, awayScore, spread, spreadFavors)

  // Step 2: Write ats_result to the game row
  const { error: gameError } = await supabase
    .from('games')
    .update({ ats_result: atsResult, home_score: homeScore, away_score: awayScore, status: 'final' })
    .eq('id', gameId)

  if (gameError) throw new Error(`Failed to update game ats_result: ${gameError.message}`)

  // Step 3: Fetch all picks for this game
  const { data: picks, error: picksError } = await supabase
    .from('picks')
    .select('id, picked_team, is_double_down')
    .eq('game_id', gameId)

  if (picksError) throw new Error(`Failed to fetch picks: ${picksError.message}`)
  if (!picks || picks.length === 0) return  // No picks to score — that's fine

  // Step 4: Calculate points_earned for each pick and bulk-update
  // We build a list of update promises and run them all at once
  const updates = picks.map((pick: { id: string; picked_team: 'home' | 'away'; is_double_down: boolean }) => {
    const points = calculatePointsEarned(pick.picked_team, pick.is_double_down, atsResult, pointValue)
    return supabase
      .from('picks')
      .update({ points_earned: points })
      .eq('id', pick.id)
  })

  // Run all pick updates at once, then check every result for errors.
  // Supabase returns { error } instead of throwing, so we must inspect each
  // result — a failed update would silently leave some picks unscored.
  const results = await Promise.all(updates)
  const failures = results.filter(r => r.error)
  if (failures.length > 0) {
    throw new Error(`Failed to score ${failures.length} pick(s): ${failures.map(r => r.error!.message).join(', ')}`)
  }
}

// -----------------------------------------------------------------------
// refreshScores
// Main "Refresh Scores" button action.
//
// Algorithm:
//   1. Find the current week (most recent non-complete week in the active season)
//   2. Get all games in that week that have an espn_game_id
//   3. Collect the unique dates those games are scheduled on (in Eastern time)
//   4. For each date, call the ESPN scoreboard endpoint
//   5. Match returned games to our stored games by espn_game_id
//   6. Update home_score, away_score, status in our database
//   7. For any stored game NOT found in the scoreboard, fall back to fetchGameById
//   8. For any game that just became "final", run scoreGame automatically
// -----------------------------------------------------------------------
export async function refreshScores() {
  try {
    const { supabase } = await requireAdmin()

    // --- Step 1: Find current week ---
    // Get all seasons that are active, then find weeks for that season
    const { data: activeSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!activeSeason) return { error: 'No active season found.' }

    // Most recent non-complete week = lowest week_number that isn't complete
    const { data: currentWeek } = await supabase
      .from('weeks')
      .select('id')
      .eq('season_id', activeSeason.id)
      .eq('is_complete', false)
      .order('week_number', { ascending: true })
      .limit(1)
      .single()

    if (!currentWeek) return { error: 'No current week found (all weeks may be complete).' }

    // --- Step 2: Get all games in this week with an ESPN ID ---
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, espn_game_id, kickoff_at, status, spread, spread_favors, point_value')
      .eq('week_id', currentWeek.id)
      .not('espn_game_id', 'is', null)

    if (gamesError) return { error: gamesError.message }
    if (!games || games.length === 0) {
      return { error: 'No games with ESPN IDs found in the current week.' }
    }

    // --- Step 3: Collect unique Eastern-time dates ---
    const dateSet = new Set<string>()
    for (const game of games) {
      dateSet.add(toEspnDate(game.kickoff_at))
    }
    const dates = Array.from(dateSet)

    // --- Step 4: Fetch scoreboard for each date ---
    // Build a map of espnGameId → EspnGame for quick lookup
    const espnMap = new Map<string, EspnGame>()
    for (const date of dates) {
      const espnGames = await fetchScoresByDate(date)
      for (const eg of espnGames) {
        espnMap.set(eg.espnGameId, eg)
      }
    }

    // --- Step 5 & 6: Match and update each stored game ---
    let updatedCount = 0
    let scoredCount = 0
    // Collect IDs of games that failed to update so we can report them
    const failedGameIds: string[] = []

    for (const game of games) {
      // Skip games that are already final or void — no need to update
      if (game.status === 'final' || game.status === 'void') continue

      // Wrap each game in its own try/catch so one bad game doesn't
      // abort processing for all remaining games in the loop.
      try {
        let espnGame = espnMap.get(game.espn_game_id)

        // --- Step 7: Fallback to per-game summary if not in scoreboard ---
        if (!espnGame) {
          espnGame = await fetchGameById(game.espn_game_id) ?? undefined
        }

        if (!espnGame) continue  // ESPN has no data for this game — skip

        const newStatus = espnGame.status
        const homeScore = espnGame.homeScore
        const awayScore = espnGame.awayScore

        // --- Step 8: Auto-score if game just became final ---
        if (newStatus === 'final' && homeScore !== null && awayScore !== null) {
          await scoreGame(
            supabase,
            game.id,
            homeScore,
            awayScore,
            game.spread,
            game.spread_favors,
            game.point_value
          )
          scoredCount++
        } else {
          // Not final yet — just update scores and status
          const { error: updateError } = await supabase
            .from('games')
            .update({
              home_score: homeScore,
              away_score: awayScore,
              status: newStatus,
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
        // One game had an error — log it and move on to the next one
        console.error(`Error processing game ${game.id}:`, gameErr)
        failedGameIds.push(game.id)
      }
    }

    revalidatePath('/admin')

    // Build a human-readable result message
    const failureNote = failedGameIds.length > 0
      ? ` ${failedGameIds.length} game(s) failed to update.`
      : ''

    return {
      success: true,
      message: `Updated ${updatedCount} game(s). Scored ${scoredCount} final game(s).${failureNote}`,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// manualScoreOverride
// Admin manually enters home_score and away_score for a game.
// If status is set to 'final', immediately triggers ATS + points calculation.
// -----------------------------------------------------------------------
export async function manualScoreOverride(formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    const game_id   = String(formData.get('game_id') ?? '').trim()
    const homeScore = Number(formData.get('home_score'))
    const awayScore = Number(formData.get('away_score'))
    const setFinal  = formData.get('set_final') === 'true'

    if (!game_id) return { error: 'Game ID is required.' }
    if (isNaN(homeScore) || isNaN(awayScore)) return { error: 'Scores must be numbers.' }

    // Fetch the game's spread and point_value so we can score it
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('spread, spread_favors, point_value')
      .eq('id', game_id)
      .single()

    if (fetchError || !game) return { error: 'Game not found.' }

    if (setFinal) {
      // Full scoring: calculate ATS result and write points to all picks
      await scoreGame(
        supabase,
        game_id,
        homeScore,
        awayScore,
        game.spread,
        game.spread_favors,
        game.point_value
      )
    } else {
      // Just update the scores without finalizing
      const { error: updateError } = await supabase
        .from('games')
        .update({ home_score: homeScore, away_score: awayScore })
        .eq('id', game_id)

      if (updateError) return { error: updateError.message }
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
