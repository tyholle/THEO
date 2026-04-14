'use client'
// src/app/auth/page.tsx
// The login and sign-up page — the first thing new users see.
// Redesigned to match the THEO brand: dark background, purple accent, gold heading.
//
// Two modes: 'login' (default) and 'signup'.
// Login shows first. "Create an Account" switches to signup.
// "Already have an account?" switches back.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // ---- Switch mode and clear error ----
  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  // ---- Login ----
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    router.push('/dashboard')
  }

  // ---- Sign up ----
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

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

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    })

    if (error) {
      const isDuplicateEmail =
        (error as { code?: string }).code === 'user_already_exists' ||
        error.message.toLowerCase().includes('already registered')
      const isTriggerError = error.message.toLowerCase().includes('database error')

      if (isDuplicateEmail) {
        setError('An account with that email already exists. Try logging in.')
      } else if (isTriggerError) {
        setError('That username is already taken. Please choose another.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setLoading(false)
      return
    }

    router.refresh()
    router.push('/dashboard')
  }

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------
  return (
    // Very dark page background — matches the screenshot
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">

      {/* ---- Logo area ---- */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <Image
          src="/theo-logo.svg"
          alt="THEO"
          width={200}
          height={62}
          priority
        />
        <p className="text-zinc-500 text-sm tracking-wide">Pick&apos;em Sports</p>
      </div>

      {/* ---- Auth card ---- */}
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-zinc-800">

        <h2 className="text-2xl font-bold text-white mb-6">
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </h2>

        {/* Error banner */}
        {error && (
          <div className="mb-5 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ---- LOGIN FORM ---- */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full grid flex-wrap align-middle h-[38px] py-2 mt-0 rounded-xl bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in…' : 'Log In'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-500">New to THEO?</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Create account — switches to signup mode */}
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="w-full py-3 rounded-xl bg-transparent border border-zinc-700 text-white font-semibold text-sm
                         hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
            >
              Create an Account
            </button>
          </form>
        )}

        {/* ---- SIGN UP FORM ---- */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-600 mt-1.5 px-1">
                Your public name on leaderboards. 3–30 characters.
              </p>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-600 mt-1.5 px-1">Minimum 6 characters.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full grid flex-wrap align-middle h-[38px] py-2 mt-0 rounded-xl bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            {/* Back to login */}
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-3 rounded-xl bg-transparent border border-zinc-700 text-zinc-300 font-medium text-sm
                         hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
            >
              Already have an account? Log In
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
