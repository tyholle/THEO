'use client'
// 'use client' is required because this button handles a click event,
// which is a browser interaction — it can't run on the server.

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    // signOut() tells Supabase to end the user's session.
    // It clears the session cookie so the middleware no longer sees them
    // as logged in on the next page request.
    const { error } = await supabase.auth.signOut()

    if (error) {
      // If sign-out fails (e.g., network issue), tell the user rather than
      // silently redirecting them — which would send them to /auth and then
      // immediately back to /dashboard because the session is still active.
      alert('Could not log out. Please try again.')
      return
    }

    // After signing out successfully, send the user back to the auth page.
    router.push('/auth')
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
