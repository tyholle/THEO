'use server'
// src/app/admin/actions/game.ts
// Server Actions for Section 2: Game Management.
//
// Covers: ESPN auto-fill lookup, add game, edit game, delete game, void game.
// All write operations are blocked if the caller is not an admin.
// Edit and delete are additionally blocked within 15 minutes of kickoff.

import { revalidatePath } from 'next/cache'
import { fetchGameById } from '@/lib/espn'
import { requireAdmin } from './helpers'

// -----------------------------------------------------------------------
// Helper: check if a game is within 15 minutes of kickoff.
// Returns true if editing/deleting should be blocked.
// -----------------------------------------------------------------------
function isLocked(kickoffAt: string): boolean {
  const kickoff = new Date(kickoffAt).getTime()
  const now = Date.now()
  const fifteenMinutes = 15 * 60 * 1000
  return now >= kickoff - fifteenMinutes
}

// -----------------------------------------------------------------------
// lookupEspnGame
// Given an ESPN game ID, fetches and returns the home team, away team,
// and kickoff time. Used to auto-fill the "Add Game" form.
// -----------------------------------------------------------------------
export async function lookupEspnGame(espnGameId: string) {
  try {
    await requireAdmin()

    const game = await fetchGameById(espnGameId.trim())
    if (!game) {
      return { error: 'Game not found. Double-check the ESPN game ID.' }
    }

    return {
      success: true,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      kickoffAt: game.kickoffAt,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// createGame
// Adds a new game to a week with all required fields.
// -----------------------------------------------------------------------
export async function createGame(formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    const week_id      = String(formData.get('week_id') ?? '').trim()
    const home_team    = String(formData.get('home_team') ?? '').trim()
    const away_team    = String(formData.get('away_team') ?? '').trim()
    const spread       = Number(formData.get('spread'))
    const spread_favors = String(formData.get('spread_favors') ?? '').trim()
    const point_value  = Number(formData.get('point_value'))
    const kickoff_at   = String(formData.get('kickoff_at') ?? '').trim()
    const espn_game_id = String(formData.get('espn_game_id') ?? '').trim() || null

    // Validate required fields
    if (!week_id || !home_team || !away_team || !kickoff_at) {
      return { error: 'All fields are required.' }
    }
    if (!['home', 'away'].includes(spread_favors)) {
      return { error: 'Spread favors must be "home" or "away".' }
    }
    if (point_value < 1 || point_value > 10) {
      return { error: 'Point value must be between 1 and 10.' }
    }
    // Spread must be a negative number (the favored team always has a negative line)
    if (spread >= 0) {
      return { error: 'Spread must be a negative number (e.g. -7.5).' }
    }

    const { error } = await supabase.from('games').insert({
      week_id,
      home_team,
      away_team,
      spread,
      spread_favors,
      point_value,
      kickoff_at,
      espn_game_id,
    })

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// updateGame
// Updates an existing game's details.
// Blocked if the game is within 15 minutes of kickoff.
// -----------------------------------------------------------------------
export async function updateGame(gameId: string, formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    // Fetch the current game to check kickoff time before allowing the edit
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('kickoff_at')
      .eq('id', gameId)
      .single()

    if (fetchError || !game) return { error: 'Game not found.' }
    if (isLocked(game.kickoff_at)) {
      return { error: 'Cannot edit a game within 15 minutes of kickoff.' }
    }

    const home_team    = String(formData.get('home_team') ?? '').trim()
    const away_team    = String(formData.get('away_team') ?? '').trim()
    const spread       = Number(formData.get('spread'))
    const spread_favors = String(formData.get('spread_favors') ?? '').trim()
    const point_value  = Number(formData.get('point_value'))
    const kickoff_at   = String(formData.get('kickoff_at') ?? '').trim()
    const espn_game_id = String(formData.get('espn_game_id') ?? '').trim() || null

    if (!['home', 'away'].includes(spread_favors)) {
      return { error: 'Spread favors must be "home" or "away".' }
    }
    if (point_value < 1 || point_value > 10) {
      return { error: 'Point value must be between 1 and 10.' }
    }
    if (spread >= 0) {
      return { error: 'Spread must be a negative number (e.g. -7.5).' }
    }

    const { error } = await supabase
      .from('games')
      .update({ home_team, away_team, spread, spread_favors, point_value, kickoff_at, espn_game_id })
      .eq('id', gameId)

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// deleteGame
// Permanently removes a game. Blocked within 15 minutes of kickoff.
// -----------------------------------------------------------------------
export async function deleteGame(gameId: string) {
  try {
    const { supabase } = await requireAdmin()

    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('kickoff_at')
      .eq('id', gameId)
      .single()

    if (fetchError || !game) return { error: 'Game not found.' }
    if (isLocked(game.kickoff_at)) {
      return { error: 'Cannot delete a game within 15 minutes of kickoff.' }
    }

    const { error } = await supabase.from('games').delete().eq('id', gameId)
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// voidGame
// Marks a game as void (cancelled/postponed after picks locked).
// Immediately sets points_earned = 0 on all picks for this game.
// Can be called at any time — no kickoff restriction.
// -----------------------------------------------------------------------
export async function voidGame(gameId: string) {
  try {
    const { supabase } = await requireAdmin()

    // Update the game row: status = 'void', ats_result = 'void'
    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'void', ats_result: 'void' })
      .eq('id', gameId)

    if (gameError) return { error: gameError.message }

    // Update all picks for this game: points_earned = 0
    const { error: picksError } = await supabase
      .from('picks')
      .update({ points_earned: 0 })
      .eq('game_id', gameId)

    if (picksError) return { error: picksError.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
