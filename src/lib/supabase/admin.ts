// src/lib/supabase/admin.ts
// This file creates a "super-powered" Supabase client using the service role key.
//
// The regular Supabase client (in server.ts) uses the "anon" key — it respects
// all the Row Level Security (RLS) rules we defined in the database. That's
// what regular users get.
//
// The service role key BYPASSES all RLS rules entirely. It can read and write
// anything in the database, including auth.users (which contains real emails).
//
// ⚠️  IMPORTANT: This client must ONLY ever be used in server-side code
//     (Server Actions, Server Components). Never import this in a file
//     that has 'use client' at the top. The service role key would be
//     exposed to the browser and anyone could use it to read all your data.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  // We use the base @supabase/supabase-js client here (not the @supabase/ssr one)
  // because the service role client doesn't need cookie-based auth — it always
  // has full access regardless of who is "logged in".
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        // Tell Supabase not to try to persist a session for this client —
        // it's a server-side admin client, not a user session.
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
