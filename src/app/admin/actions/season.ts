'use server'
// src/app/admin/actions/season.ts
// Server Actions for Section 1: Season & Week Management.
//
// "Server Actions" are async functions that run on our server, not in your browser.
// They can safely write to the database. Client components call them like normal
// functions, and Next.js handles the behind-the-scenes HTTP request automatically.
//
// Every action here:
//   1. Verifies the caller is still an admin (second layer of protection)
//   2. Does the database operation
//   3. Calls revalidatePath('/admin') to tell Next.js to refresh the page data
//   4. Returns { success: true } or { error: 'message' }

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './helpers'

// -----------------------------------------------------------------------
// createSport
// Adds a new sport to the sports table (e.g., "College Football", slug "cfb").
// -----------------------------------------------------------------------
export async function createSport(formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    const name = String(formData.get('name') ?? '').trim()
    const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
    const is_active = formData.get('is_active') === 'true'

    if (!name || !slug) return { error: 'Name and slug are required.' }
    // Slugs should only contain letters, numbers, and hyphens
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { error: 'Slug can only contain lowercase letters, numbers, and hyphens.' }
    }

    const { error } = await supabase.from('sports').insert({ name, slug, is_active })
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// createSeason
// Adds a new season for a sport (e.g., "2025 CFB Season").
// -----------------------------------------------------------------------
export async function createSeason(formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    const sport_id   = String(formData.get('sport_id') ?? '').trim()
    const name       = String(formData.get('name') ?? '').trim()
    const year       = Number(formData.get('year'))
    const starts_at  = String(formData.get('starts_at') ?? '').trim()
    const ends_at    = String(formData.get('ends_at') ?? '').trim()

    if (!sport_id || !name || !year || !starts_at || !ends_at) {
      return { error: 'All fields are required.' }
    }

    const { error } = await supabase.from('seasons').insert({
      sport_id,
      name,
      year,
      starts_at,
      ends_at,
      is_active: false, // Seasons start inactive; use activateSeason to enable
    })
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// activateSeason
// Sets one season as active and deactivates all other seasons for the same sport.
// Only one season per sport can be active at a time.
// -----------------------------------------------------------------------
export async function activateSeason(seasonId: string) {
  try {
    const { supabase } = await requireAdmin()

    // First, find out which sport this season belongs to
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('sport_id')
      .eq('id', seasonId)
      .single()

    if (fetchError || !season) return { error: 'Season not found.' }

    // Deactivate all other seasons for this sport
    const { error: deactivateError } = await supabase
      .from('seasons')
      .update({ is_active: false })
      .eq('sport_id', season.sport_id)
      .neq('id', seasonId)  // "neq" means "not equal to" — skip the one we're activating

    if (deactivateError) return { error: deactivateError.message }

    // Activate the selected season
    const { error: activateError } = await supabase
      .from('seasons')
      .update({ is_active: true })
      .eq('id', seasonId)

    if (activateError) return { error: activateError.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// createWeek
// Adds a new week to a season (e.g., Week 1 of the 2025 CFB season).
// -----------------------------------------------------------------------
export async function createWeek(formData: FormData) {
  try {
    const { supabase } = await requireAdmin()

    const season_id   = String(formData.get('season_id') ?? '').trim()
    const week_number = Number(formData.get('week_number'))
    const label       = String(formData.get('label') ?? '').trim()

    if (!season_id || !week_number || !label) {
      return { error: 'All fields are required.' }
    }

    const { error } = await supabase.from('weeks').insert({
      season_id,
      week_number,
      label,
    })
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// markWeekComplete
// Flags a week as finished — no more scoring changes, shows on the
// leaderboard as "final" for that week.
// -----------------------------------------------------------------------
export async function markWeekComplete(weekId: string) {
  try {
    const { supabase } = await requireAdmin()

    const { error } = await supabase
      .from('weeks')
      .update({ is_complete: true })
      .eq('id', weekId)

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// deleteSeason
// Permanently deletes a season.
// BLOCKED if the season has any weeks — delete the weeks first.
// This prevents accidentally wiping a whole season's pick history.
// -----------------------------------------------------------------------
export async function deleteSeason(seasonId: string) {
  try {
    const { supabase } = await requireAdmin()

    // Check if any weeks exist for this season
    const { count, error: countError } = await supabase
      .from('weeks')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)

    if (countError) return { error: countError.message }

    if (count && count > 0) {
      return {
        error: `Cannot delete this season — it still has ${count} week(s). Delete all weeks first.`,
      }
    }

    const { error } = await supabase.from('seasons').delete().eq('id', seasonId)
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// deleteWeek
// Permanently deletes a week.
// BLOCKED if the week has any games — delete the games first.
// This prevents accidentally wiping a week's pick data.
// -----------------------------------------------------------------------
export async function deleteWeek(weekId: string) {
  try {
    const { supabase } = await requireAdmin()

    // Check if any games exist for this week
    const { count, error: countError } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', weekId)

    if (countError) return { error: countError.message }

    if (count && count > 0) {
      return {
        error: `Cannot delete this week — it still has ${count} game(s). Delete all games from the Games tab first.`,
      }
    }

    const { error } = await supabase.from('weeks').delete().eq('id', weekId)
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
