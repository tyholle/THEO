'use client'
// 'use client' is required because this button handles a click event,
// which is a browser interaction — it can't run on the server.

import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const supabase = createClient()

  async function handleLogout() {
    // signOut() tells Supabase to end the user's session.
    // It clears the session cookie so the middleware no longer sees them
    // as logged in on the next page request.
    const { error } = await supabase.auth.signOut()

    if (error) {
      // If sign-out fails (e.g., network issue), tell the user rather than
      // silently redirecting them — which would send them to /auth and then
      // immediately back to /picks because the session is still active.
      alert('Could not log out. Please try again.')
      return
    }

    // Hard navigation: bypass the Next.js router cache so the auth page
    // always renders fresh and the previous user's session data is gone.
    window.location.href = '/auth'
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400
                 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
    >
      Log Out
    </button>
  )
}
