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
import { requireAdmin } from './helpers'
import { runRefreshScores, scoreGame } from '@/lib/refresh-scores'

// -----------------------------------------------------------------------
// refreshScores
// Admin "Refresh Scores" button — verifies the caller is an admin, then
// delegates all ESPN fetching and DB updates to runRefreshScores().
// -----------------------------------------------------------------------
export async function refreshScores() {
  try {
    const { supabase } = await requireAdmin()
    const result = await runRefreshScores(supabase)
    revalidatePath('/admin')
    return { success: true, message: result.message }
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
