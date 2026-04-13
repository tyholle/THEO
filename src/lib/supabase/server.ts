// server.ts
// This file creates a Supabase client for use on the server side of the app.
// "Server side" means code that runs on our computer/server before the page
// is sent to the user's browser — like in middleware or page components that
// fetch data.
//
// The key difference from the browser client: this version reads and writes
// cookies (small pieces of data stored in the user's browser) to know who is
// logged in. It needs access to Next.js's cookie system to do this.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  // cookies() is a Next.js function that reads the cookies from the
  // incoming request — this is how we know which user is logged in.
  const cookieStore = cookies()

  return createServerClient(
    // These are the Supabase connection details from our .env.local file.
    // The ! at the end tells TypeScript "trust me, this value exists".
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // getAll: Supabase calls this to read all current cookies.
        getAll() {
          return cookieStore.getAll()
        },
        // setAll: Supabase calls this to save updated session cookies.
        // The try/catch is needed because Server Components (read-only
        // page components) can't set cookies — only middleware can.
        // We can safely ignore the error there because middleware handles
        // the actual cookie refresh.
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Silently ignored when called from a Server Component.
            // Middleware keeps the session fresh so this is safe.
          }
        },
      },
    }
  )
}
