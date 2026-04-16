'use server'
// src/app/admin/actions/helpers.ts
// Shared utilities for all admin server actions.
//
// This file exists so we don't copy-paste the same requireAdmin() function
// into every action file. If admin verification ever changes, we fix it here
// and all five action files stay in sync automatically.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// The shape returned by requireAdmin — the caller gets both the supabase
// client (already authenticated) and the verified user object.
export type AdminContext = {
  supabase: SupabaseClient
  user: { id: string }
}

// -----------------------------------------------------------------------
// requireAdmin
// Verifies the current request comes from a logged-in admin.
// Throws an error (which the action's try/catch will convert to { error: ... })
// if the caller is not authenticated or not an admin.
//
// Why we check this in every action instead of relying only on middleware:
// Server Actions can be called directly via fetch — middleware only runs on
// page navigation, not on programmatic action calls. We never trust only
// the client-side check.
// -----------------------------------------------------------------------
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) throw new Error('Not authorized')

  return { supabase, user: { id: user.id } }
}
