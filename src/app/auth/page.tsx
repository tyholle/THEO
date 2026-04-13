'use client'
// 'use client' tells Next.js this component runs in the browser, not the server.
// We need this because the page uses React state (useState) and user interactions.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The two possible modes for this page.
type Mode = 'login' | 'signup'

export default function AuthPage() {
  // useRouter lets us programmatically navigate to another page (e.g., /dashboard).
  const router = useRouter()

  // createClient() gives us a Supabase connection that works in the browser.
  const supabase = createClient()

  // mode controls which form is shown: 'login' or 'signup'.
  // We default to 'login' so returning users see the login form first.
  const [mode, setMode] = useState<Mode>('login')

  // Form field values — each one is a piece of state that updates as the user types.
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')

  // error holds any message we want to show the user if something goes wrong.
  const [error, setError] = useState<string | null>(null)

  // loading is true while we're waiting for Supabase to respond.
  // We use it to disable the submit button so the user can't click twice.
  const [loading, setLoading] = useState(false)

  // ------------------------------------------------------------------
  // handleLogin: called when the user submits the Log In form.
  // ------------------------------------------------------------------
  async function handleLogin(e: React.FormEvent) {
    // Prevent the browser's default form behaviour (which would reload the page).
    e.preventDefault()
    setLoading(true)
    setError(null)

    // signInWithPassword sends the email + password to Supabase.
    // Supabase checks them and either returns the user or an error.
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Show the error to the user and stop the loading spinner.
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    // Success — send the user to /dashboard.
    // router.refresh() tells Next.js to re-fetch server-side data so the
    // session is recognised immediately before we navigate.
    router.refresh()
    router.push('/dashboard')
  }

  // ------------------------------------------------------------------
  // handleSignUp: called when the user submits the Sign Up form.
  // ------------------------------------------------------------------
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate the username before calling Supabase.
    // Only letters (a-z, A-Z), numbers (0-9), underscores (_), and hyphens (-) allowed.
    // This prevents usernames like "hello world" or "user@name" that would look
    // broken on leaderboards and in group chats.
    const usernamePattern = /^[a-zA-Z0-9_-]+$/
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.')
      setLoading(false)
      return
    }
    if (username.trim().length > 30) {
      setError('Username must be 30 characters or fewer.')
      setLoading(false)
      return
    }
    if (!usernamePattern.test(username.trim())) {
      setError('Username can only contain letters, numbers, underscores, and hyphens.')
      setLoading(false)
      return
    }

    // signUp creates a new user in Supabase Auth.
    // The `options.data` object is stored as "metadata" on the user.
    // Our database trigger (handle_new_user) reads this metadata and
    // saves the username to the profiles table automatically.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
        },
      },
    })

    if (error) {
      // Supabase AuthErrors have a `code` field for known error types.
      // `user_already_exists` is the structured code for duplicate email signup.
      // We also check the message text as a fallback for older SDK versions.
      const isDuplicateEmail =
        (error as { code?: string }).code === 'user_already_exists' ||
        error.message.toLowerCase().includes('already registered')

      // When our database trigger fails (e.g., duplicate username violates the
      // UNIQUE constraint), Supabase wraps the Postgres error in a generic
      // "Database error saving new user" message.
      const isTriggerError = error.message.toLowerCase().includes('database error')

      if (isDuplicateEmail) {
        setError('An account with that email already exists. Try logging in.')
      } else if (isTriggerError) {
        setError('That username is already taken. Please choose another.')
      } else {
        // Something unexpected happened (network issue, misconfiguration, etc.).
        // Show a generic message rather than incorrectly blaming the username.
        setError('Something went wrong. Please try again.')
      }
      setLoading(false)
      return
    }

    // Success — send the user to /dashboard.
    router.refresh()
    router.push('/dashboard')
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  return (
    // Full-screen dark background, content centred vertically and horizontally.
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">

      {/* Card container — slightly lighter than the page background */}
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-8 shadow-xl">

        {/* App name / logo area */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-400 tracking-tight">THEO</h1>
          <p className="text-zinc-400 text-sm mt-1">Pick&apos;em Sports</p>
        </div>

        {/* Tab switcher — shows which form is active */}
        <div className="flex rounded-lg overflow-hidden mb-6 border border-zinc-700">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-green-500 text-zinc-950'
                : 'bg-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-green-500 text-zinc-950'
                : 'bg-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error message — only shown when `error` is not null */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ---- LOGIN FORM ---- */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-green-500 text-zinc-950 font-semibold text-sm
                         hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>
        )}

        {/* ---- SIGN UP FORM ---- */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="pickmaster99"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-500 mt-1">
                This is your public name on leaderboards. At least 3 characters.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-500 mt-1">Minimum 6 characters.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-green-500 text-zinc-950 font-semibold text-sm
                         hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
