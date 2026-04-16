'use server'
// src/app/admin/actions/users.ts
// Server Actions for Section 5: User Management.
//
// One action: toggleAdminStatus
// Flips a user's is_admin flag in the profiles table.
// Two safety guards:
//   1. Admin cannot revoke their own access
//   2. Caller must be an admin to run this at all

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './helpers'

// -----------------------------------------------------------------------
// toggleAdminStatus
// Gives or removes admin access for a user.
//
// targetUserId — the ID of the user whose admin status is being changed
// newValue     — true (make admin) or false (remove admin)
// -----------------------------------------------------------------------
export async function toggleAdminStatus(targetUserId: string, newValue: boolean) {
  try {
    const { supabase, user } = await requireAdmin()

    // Guard: prevent admin from revoking their own access
    if (targetUserId === user.id && newValue === false) {
      return { error: 'You cannot remove your own admin access.' }
    }

    // Update the target user's is_admin field
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: newValue })
      .eq('id', targetUserId)

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
