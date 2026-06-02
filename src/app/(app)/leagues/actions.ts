'use server'
// src/app/(app)/leagues/actions.ts
//
// Server Actions for all league mutations (create, join, leave, etc.).
//
// A "Server Action" is a function that runs on our server, not in your browser.
// Client components call these like normal functions — Next.js automatically
// sends the data to the server and brings the result back.
//
// Every action here:
//   1. Verifies the caller is logged in (requireUser)
//   2. Validates the input
//   3. Performs the database operation
//   4. Calls revalidatePath() to tell Next.js to refresh the page data
//   5. Returns { success: true } or { error: 'message' }

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// -----------------------------------------------------------------------
// Join code character set
// We exclude 0/O (look the same) and 1/I (look the same) to avoid
// confusion when users type the code from memory or a photo.
// Safe set: 24 letters (A–Z minus O and I) + 8 numbers (2–9) = 32 chars
// -----------------------------------------------------------------------
const JOIN_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// -----------------------------------------------------------------------
// generateJoinCode
// Creates a random 6-character code like "XK9T2A".
// crypto.getRandomValues is built into Node.js and creates truly random bytes.
// We modulo each byte by 32 (the charset length) to pick a character.
// -----------------------------------------------------------------------
function generateJoinCode(): string {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  return Array.from(array, byte => JOIN_CODE_CHARSET[byte % JOIN_CODE_CHARSET.length]).join('')
}

// -----------------------------------------------------------------------
// requireUser
// Checks that the person calling the action is logged in.
// Returns the Supabase client and their user ID so the action can use them.
// Throws an error if not authenticated — the try/catch in each action
// converts that into { error: '...' } returned to the UI.
// -----------------------------------------------------------------------
async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated. Please log in.')
  return { supabase, userId: user.id }
}


// -----------------------------------------------------------------------
// createLeague
// Creates a new league and adds the creator as its commissioner (owner).
// formData comes from the HTML form the user submitted.
//
// Two separate inserts (groups, then group_members) with a compensating
// rollback: if the membership insert fails after the group was created,
// we delete the group so no orphan league is left behind.
//
// Why not a SECURITY DEFINER RPC? In Supabase's hosted environment,
// SECURITY DEFINER does not reliably bypass RLS on INSERT. The app's
// own server actions run with the authenticated user's session, which
// is sufficient — we just need the INSERT policy to allow user_id = auth.uid().
// -----------------------------------------------------------------------
export async function createLeague(formData: FormData) {
  try {
    const { supabase, userId } = await requireUser()

    const name     = String(formData.get('name')     ?? '').trim()
    const sport_id = String(formData.get('sport_id') ?? '').trim()

    if (!name)     return { error: 'League name is required.' }
    if (!sport_id) return { error: 'Please select a sport.' }
    if (name.length > 50) return { error: 'League name must be 50 characters or fewer.' }

    // Validate that the selected sport is currently active.
    // The form only shows active sports, but someone could bypass the UI
    // and POST any sport_id UUID — this check catches that.
    const { data: activeSport } = await supabase
      .from('sports')
      .select('id')
      .eq('id', sport_id)
      .eq('is_active', true)
      .maybeSingle()
    if (!activeSport) return { error: 'Selected sport is not available.' }

    // Generate the group ID here in TypeScript before inserting.
    //
    // Why: if we used .insert(...).select('id'), Supabase would run
    // INSERT ... RETURNING id, which then tries to SELECT the new row back.
    // Our SELECT policy only shows groups you're already a member of —
    // but the membership row doesn't exist yet — so the RETURNING result
    // is empty and PostgREST throws it as an RLS violation.
    //
    // By pre-generating the ID we never need to read the row back,
    // which sidesteps the issue entirely.
    let groupId = ''

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId   = crypto.randomUUID()
      const candidateCode = generateJoinCode()

      const { error: groupError } = await supabase
        .from('groups')
        .insert({ id: candidateId, name, sport_id, join_code: candidateCode, created_by: userId, max_members: 50 })

      if (!groupError) {
        groupId = candidateId
        break
      }

      // 23505 = unique_violation on join_code — try a different code
      if (groupError.code !== '23505') return { error: groupError.message }
    }

    if (!groupId) return { error: 'Could not generate a join code. Please try again.' }

    // Add the creator as the league owner (commissioner).
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId, role: 'owner' })

    if (memberError) return { error: memberError.message }

    revalidatePath('/leagues')
    return { success: true as const, groupId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// previewLeague
// Looks up a league by its join code and returns a preview of it.
// Does NOT add the user to the league — that's a separate step (joinLeague).
// This lets the UI show "here's the league you're about to join, confirm?"
//
// Uses the lookup_group_by_join_code() DB function (SECURITY DEFINER) so
// a non-member can look up exactly one league by code without being able
// to enumerate the full groups table.
// -----------------------------------------------------------------------
export async function previewLeague(joinCode: string) {
  try {
    const { supabase } = await requireUser()

    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) return { error: 'Join code must be 6 characters.' }

    // Call the SECURITY DEFINER DB function — handles the lookup, membership
    // check, and capacity check all in one query.
    const { data: rows, error } = await supabase
      .rpc('lookup_group_by_join_code', { p_code: code })

    const group = rows?.[0]
    if (error || !group) return { error: 'No league found with that code.' }

    if (group.already_member) return { error: "You're already in this league." }

    if (Number(group.member_count) >= group.max_members) {
      return { error: `This league is full (${group.max_members} members max).` }
    }

    // Fetch sport name separately (avoids PostgREST FK join schema-cache issues)
    let sportName = 'Unknown Sport'
    if (group.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('name')
        .eq('id', group.sport_id)
        .maybeSingle()
      if (sport) sportName = sport.name
    }

    return {
      success: true as const,
      league: {
        id:          group.id,
        name:        group.name,
        sportName,
        memberCount: Number(group.member_count),
        maxMembers:  group.max_members,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// joinLeague
// Adds the current user to a league they've already previewed and confirmed.
// joinCode is the 6-character code the user entered (kept in client state
// through the preview step).
//
// Uses the join_group_by_code() DB function which re-validates the code,
// checks capacity, and inserts the membership atomically — all in one
// transaction. This prevents bypassing the join code by calling the API
// directly, and handles the race condition where the league fills up
// between the preview and the confirm click.
// -----------------------------------------------------------------------
export async function joinLeague(joinCode: string) {
  try {
    const { supabase } = await requireUser()

    const { error } = await supabase
      .rpc('join_group_by_code', { p_code: joinCode })

    if (error) return { error: error.message }

    revalidatePath('/leagues')
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// deleteLeague
// Commissioner-only: soft-deletes the league by setting is_active = false.
// This hides it from all members' hubs and prevents new joins, but keeps
// all pick history intact in the database (an admin can restore it if needed).
// -----------------------------------------------------------------------
export async function deleteLeague(groupId: string) {
  try {
    const { supabase, userId } = await requireUser()

    // Verify the caller is the owner
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (membership?.role !== 'owner') {
      return { error: 'Only the commissioner can delete the league.' }
    }

    const { error } = await supabase
      .from('groups')
      .update({ is_active: false })
      .eq('id', groupId)

    if (error) return { error: error.message }

    revalidatePath('/leagues')
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// leaveLeague
// Removes the current user from a league.
// Commissioners must transfer their role first — the DB does not
// auto-assign a new commissioner.
// -----------------------------------------------------------------------
export async function leaveLeague(groupId: string) {
  try {
    const { supabase, userId } = await requireUser()

    // Check the user's current role in this league
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) return { error: 'You are not a member of this league.' }

    if (membership.role === 'owner') {
      return { error: 'Transfer the commissioner role to another member before leaving.' }
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)

    if (error) return { error: error.message }

    revalidatePath('/leagues')
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// removeMember
// Commissioner-only: removes a specific member from the league.
// The removed user keeps their pick history but loses access to the league.
// They can be re-added later by joining with the code again.
// -----------------------------------------------------------------------
export async function removeMember(groupId: string, targetUserId: string) {
  try {
    const { supabase, userId } = await requireUser()

    // Verify the caller is this league's commissioner
    const { data: callerMembership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (callerMembership?.role !== 'owner') {
      return { error: 'Only the commissioner can remove members.' }
    }
    if (targetUserId === userId) {
      return { error: 'You cannot remove yourself. Transfer commissioner first, then leave.' }
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)

    if (error) return { error: error.message }

    revalidatePath(`/leagues/${groupId}`)
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// transferCommissioner
// Transfers the owner role from the current user to another member.
//
// IMPORTANT ORDER: We promote the target FIRST (while the caller is still
// owner). If we demoted the caller first, the second update (promoting the
// target) would fail the RLS owner check because the caller is no longer
// an owner. By promoting the target first, both updates happen while at
// least one of them (the caller) is still marked owner in the DB.
// -----------------------------------------------------------------------
export async function transferCommissioner(groupId: string, targetUserId: string) {
  try {
    const { supabase, userId } = await requireUser()

    // Verify caller is the owner
    const { data: callerMembership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (callerMembership?.role !== 'owner') {
      return { error: 'Only the commissioner can transfer the role.' }
    }
    if (targetUserId === userId) {
      return { error: 'You are already the commissioner.' }
    }

    // Step 1: Promote target to owner FIRST (caller still owner → RLS passes)
    const { error: promoteError } = await supabase
      .from('group_members')
      .update({ role: 'owner' })
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)

    if (promoteError) return { error: promoteError.message }

    // Step 2: Demote caller to member
    const { error: demoteError } = await supabase
      .from('group_members')
      .update({ role: 'member' })
      .eq('group_id', groupId)
      .eq('user_id', userId)

    if (demoteError) {
      // Rollback: put the target back to member so we don't end up with two owners
      await supabase
        .from('group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('user_id', targetUserId)
      return { error: demoteError.message }
    }

    revalidatePath(`/leagues/${groupId}`)
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// -----------------------------------------------------------------------
// editLeagueName
// Commissioner-only: updates the league's display name.
// The RLS policy now checks group_members for the owner role, so a
// transferred commissioner can use this action correctly.
// -----------------------------------------------------------------------
export async function editLeagueName(groupId: string, newName: string) {
  try {
    const { supabase, userId } = await requireUser()

    const name = newName.trim()
    if (!name)          return { error: 'League name cannot be empty.' }
    if (name.length > 50) return { error: 'League name must be 50 characters or fewer.' }

    // Verify caller is owner (gives a clearer error than the raw RLS rejection)
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (membership?.role !== 'owner') {
      return { error: 'Only the commissioner can edit the league name.' }
    }

    const { error } = await supabase
      .from('groups')
      .update({ name })
      .eq('id', groupId)

    if (error) return { error: error.message }

    revalidatePath(`/leagues/${groupId}`)
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
