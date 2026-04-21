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
// Given an ESPN game ID and sport slug, fetches and returns the home team,
// away team, kickoff time, short names, and logo URLs.
// Used to auto-fill the "Add Game" form in the admin panel.
// -----------------------------------------------------------------------
export async function lookupEspnGame(espnGameId: string, sportSlug: string) {
  try {
    await requireAdmin()

    const game = await fetchGameById(espnGameId.trim(), sportSlug)
    if (!game) {
      return { error: 'Game not found. Double-check the ESPN game ID.' }
    }

    return {
      success: true,
      homeTeam:      game.homeTeam,
      awayTeam:      game.awayTeam,
      kickoffAt:     game.kickoffAt,
      // New fields — passed back so they can be stored when game is created
      homeShortName: game.homeShortName,
      awayShortName: game.awayShortName,
      homeLogoUrl:   game.homeLogoUrl,
      awayLogoUrl:   game.awayLogoUrl,
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
    // sport_slug is passed as a hidden field from the GameTab form so we know
    // which ESPN API URL to call (e.g. "nfl" → football/nfl)
    const sport_slug   = String(formData.get('sport_slug') ?? 'cfb').trim()

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

    // No two games in the same week may share a point value.
    // We check the DB here so this rule holds even if the UI dropdown is bypassed.
    const { data: conflict } = await supabase
      .from('games')
      .select('id')
      .eq('week_id', week_id)
      .eq('point_value', point_value)
      .limit(1)

    if (conflict && conflict.length > 0) {
      return { error: `Point value ${point_value} is already assigned to another game this week. Each game must have a unique point value.` }
    }

    // If an ESPN game ID was provided, fetch team logos and short names now.
    // We do this silently — if ESPN is unavailable, the game still gets created,
    // just without logos (the picks page handles null gracefully).
    let home_short_name: string | null = null
    let away_short_name: string | null = null
    let home_logo_url:   string | null = null
    let away_logo_url:   string | null = null

    if (espn_game_id) {
      try {
        const espnData = await fetchGameById(espn_game_id, sport_slug)
        if (espnData) {
          home_short_name = espnData.homeShortName
          away_short_name = espnData.awayShortName
          home_logo_url   = espnData.homeLogoUrl
          away_logo_url   = espnData.awayLogoUrl
        }
      } catch {
        // ESPN lookup failed — game still saves, just without logo/short name
        console.warn('ESPN lookup failed during createGame; logos will be null')
      }
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
      home_short_name,
      away_short_name,
      home_logo_url,
      away_logo_url,
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

    // Fetch the current game along with its week → season → sport chain.
    // We need the sport slug so we can call the right ESPN API URL when
    // re-fetching logos during an edit. Supabase lets us follow foreign
    // keys using dot notation in the select string.
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('kickoff_at, week_id, weeks(seasons(sports(slug)))')
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

    // No two games in the same week may share a point value.
    // Exclude the current game so it can keep its own value unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameWeekId: string = (game as any).week_id
    const { data: conflict } = await supabase
      .from('games')
      .select('id')
      .eq('week_id', gameWeekId)
      .eq('point_value', point_value)
      .neq('id', gameId)
      .limit(1)

    if (conflict && conflict.length > 0) {
      return { error: `Point value ${point_value} is already assigned to another game this week.` }
    }

    // If an ESPN game ID is provided, re-fetch logos and short names so they
    // stay in sync if the admin corrects the ESPN ID on an existing game.
    // IMPORTANT: only include logo/name columns in the update if the ESPN
    // lookup actually returned data. If we always include them (even as null),
    // every admin edit would erase logos that were previously saved.
    let espnFields: {
      home_short_name?: string | null
      away_short_name?: string | null
      home_logo_url?: string | null
      away_logo_url?: string | null
    } = {}

    if (espn_game_id) {
      try {
        // Derive the sport slug by following game → week → season → sport.
        // TypeScript doesn't know the nested shape from supabase's inference,
        // so we cast to `any` just for this one deeply-nested read.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sportSlug: string = (game as any)?.weeks?.seasons?.sports?.slug ?? 'cfb'
        const espnData = await fetchGameById(espn_game_id, sportSlug)
        if (espnData) {
          espnFields = {
            home_short_name: espnData.homeShortName,
            away_short_name: espnData.awayShortName,
            home_logo_url:   espnData.homeLogoUrl,
            away_logo_url:   espnData.awayLogoUrl,
          }
        }
      } catch {
        console.warn('ESPN lookup failed during updateGame; existing logos preserved')
      }
    }

    const { error } = await supabase
      .from('games')
      .update({
        home_team, away_team, spread, spread_favors, point_value, kickoff_at, espn_game_id,
        ...espnFields, // Only overrides logo columns if ESPN lookup succeeded
      })
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
