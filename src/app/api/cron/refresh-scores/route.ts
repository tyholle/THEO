// src/app/api/cron/refresh-scores/route.ts
//
// This is a protected HTTP endpoint that runs the score-refresh logic
// automatically on a schedule. It's called by a cron job — either
// Vercel's built-in cron (configured in vercel.json) or an external
// service like cron-job.org.
//
// PROTECTION: Every call must include the secret from your environment
// variables as a Bearer token. Without it, the request is rejected.
// This prevents random people on the internet from triggering refreshes.
//
// HOW TO SET UP:
//   1. Add CRON_SECRET=<any long random string> to your Vercel env vars
//      (Settings → Environment Variables)
//   2. The cron job sends: Authorization: Bearer <your CRON_SECRET>
//   3. Vercel's built-in cron does this automatically.
//      External services (cron-job.org etc.) need the header configured manually.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runRefreshScores } from '@/lib/refresh-scores'

export async function GET(request: Request) {
  // ---- Auth check ----
  // Vercel's cron system sends this header automatically using CRON_SECRET.
  // Without a matching secret, we return 401 Unauthorized.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    // CRON_SECRET is not set — log a warning and refuse the request.
    // This prevents the endpoint from running unprotected in production.
    console.error('[cron] CRON_SECRET environment variable is not set.')
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  // ---- Run the refresh ----
  // We use the service-role (admin) Supabase client here — it bypasses RLS
  // and doesn't need a logged-in user. This is safe because the endpoint
  // is already protected by the CRON_SECRET check above.
  try {
    const supabase = createAdminClient()
    const result   = await runRefreshScores(supabase)

    console.info(`[cron] Refresh complete: ${result.message}`)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron] Refresh failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
