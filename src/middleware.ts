// middleware.ts
// This file runs automatically on EVERY page request before the page loads.
// Think of it as a bouncer — it checks who you are and decides whether to
// let you through or redirect you somewhere else.
//
// It lives at src/middleware.ts which is the exact location Next.js expects.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Start by creating a default "continue normally" response.
  // We may replace this with a redirect below if needed.
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Create a Supabase client that works inside middleware.
  // Middleware has its own special cookie handling — it reads cookies from
  // the incoming request and writes updated cookies back into the response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read all cookies from the browser's request.
        getAll() {
          return request.cookies.getAll()
        },
        // When Supabase needs to update the session token, write the new
        // cookies into both the request and the response so they stay in sync.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() must be called here to refresh the session.
  // Do not add any code between createServerClient and getUser() —
  // it can cause hard-to-debug logout issues.
  //
  // getUser() talks to Supabase to confirm the session is still valid.
  // If the user is logged in, `user` will contain their info.
  // If they're not logged in (or their session expired), `user` will be null.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Helper: builds a redirect response that also carries any refreshed session
  // cookies from supabaseResponse. Without this, a token that was silently
  // refreshed during getUser() would be lost and the user could be logged out
  // prematurely on the very next request.
  function redirectWithCookies(destination: string) {
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url))
    // Pass the full cookie object (not just name + value) so that security
    // attributes like HttpOnly, Secure, SameSite, and Max-Age are preserved
    // exactly as Supabase set them. Dropping those attributes could change
    // how the browser stores or expires the session cookie.
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // -----------------------------------------------------------------------
  // RULE 1: Already logged in + visiting /auth → send to /dashboard
  // There's no reason for a logged-in user to see the login page.
  // -----------------------------------------------------------------------
  if (user && pathname === '/auth') {
    return redirectWithCookies('/dashboard')
  }

  // -----------------------------------------------------------------------
  // RULE 2: Not logged in + visiting a protected page → send to /auth
  // These are pages that require a login to use.
  // -----------------------------------------------------------------------
  const protectedRoutes = ['/dashboard', '/picks', '/leaderboard', '/leagues', '/admin', '/rules']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute && !user) {
    return redirectWithCookies('/auth')
  }

  // -----------------------------------------------------------------------
  // RULE 3: Logged in + visiting /admin + NOT an admin → send to /dashboard
  // We only run this extra database check if the user is actually logged in
  // and trying to reach /admin (to avoid extra DB calls on every request).
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/admin') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return redirectWithCookies('/dashboard')
    }
  }

  // If none of the rules above triggered a redirect, let the request through.
  return supabaseResponse
}

// config.matcher tells Next.js which URLs this middleware should run on.
// This pattern means: run on ALL paths EXCEPT:
//   - Next.js internal files (_next/static, _next/image)
//   - favicon.ico
//   - Image files (svg, png, jpg, etc.)
// We skip those because they're just files, not pages — no auth check needed.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
