// client.ts
// This file creates a Supabase client for use in the browser — meaning
// inside interactive components like forms, buttons, and anything marked
// with 'use client' at the top.
//
// Unlike the server client, this version runs in the user's own browser,
// so it doesn't need to manually handle cookies — the browser does that
// automatically.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    // Same Supabase connection details as the server client.
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
