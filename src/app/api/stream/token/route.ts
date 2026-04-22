// src/app/api/stream/token/route.ts
//
// GET /api/stream/token
//
// The browser calls this endpoint when opening the Chat tab.
// It returns a signed token that lets the user connect to Stream Chat.
//
// Why a token instead of just the API key?
// Stream requires server-signed tokens so only authenticated users can
// connect. The token is generated using our STREAM_API_SECRET, which
// never leaves the server. The browser only ever sees the short-lived token.
//
// What this route does:
//   1. Verifies the caller is logged into Supabase
//   2. Fetches their username from our profiles table
//   3. "Upserts" (creates or updates) the user in Stream with their username
//   4. Generates and returns a signed token for that user

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamAdmin } from '@/lib/stream'

export async function GET() {
  try {
    const supabase = createClient()

    // ---- Auth check ----
    // If the user isn't logged into Supabase, reject the request.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // ---- Fetch username ----
    // We use the Supabase `username` field (e.g. "tylerh") as the display name
    // in Stream Chat — consistent with how users appear on leaderboards.
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    const username = profile?.username ?? user.id

    // ---- Register user in Stream ----
    // "Upsert" means: create the user in Stream if they don't exist yet,
    // or update their name if they do. This keeps usernames in sync if
    // someone ever changes theirs.
    // Wrapped in its own try/catch: if Stream's API is temporarily down,
    // we still generate the token. The user likely already exists in Stream
    // from a prior call, so the token will work even without the upsert.
    try {
      await streamAdmin.upsertUser({ id: user.id, name: username })
    } catch {
      console.warn('[stream/token] upsertUser failed — continuing with token generation')
    }

    // ---- Generate token ----
    // createToken() signs a JWT using our secret key.
    // The token identifies this user to Stream — no password or secret is
    // ever sent to the browser.
    const token = streamAdmin.createToken(user.id)

    return NextResponse.json({ token, userId: user.id })
  } catch (err) {
    console.error('[stream/token] Token generation failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Chat unavailable. Please try again.' }, { status: 503 })
  }
}
