// dashboard/page.tsx
// The main page users land on after logging in.
// This is a Server Component (no 'use client') — it can fetch data securely
// from Supabase on the server before the page is sent to the browser.
//
// For now it's a simple placeholder. We'll build the full dashboard later.

import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import Logo from '@/components/Logo'

export default async function DashboardPage() {
  // Create a server-side Supabase client and fetch the logged-in user.
  // getUser() is the safe way to get the current user on the server —
  // it verifies the session with Supabase rather than just reading a cookie.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Simple top bar */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Logo />
        {/* LogoutButton is a client component — Next.js handles the mix fine */}
        <LogoutButton />
      </header>

      {/* Page content */}
      <main className="px-6 py-8">
        <h2 className="text-2xl font-semibold mb-2">Dashboard</h2>
        {/* Show the logged-in user's email as a simple proof the auth works */}
        {user && (
          <p className="text-zinc-400 text-sm">
            Logged in as <span className="text-zinc-200">{user.email}</span>
          </p>
        )}
        <p className="text-zinc-500 text-sm mt-6">
          Full dashboard coming soon.
        </p>
      </main>
    </div>
  )
}
