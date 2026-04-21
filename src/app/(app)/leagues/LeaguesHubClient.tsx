'use client'
// src/app/(app)/leagues/LeaguesHubClient.tsx
//
// The interactive part of the leagues hub.
// Handles: Create League form, Join League two-step flow,
// and rendering the list of league cards.
//
// The server component (page.tsx) fetches all data and passes it here.
// This component only handles UI state — no database calls directly.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import LeagueCard from './LeagueCard'
import { createLeague, previewLeague, joinLeague } from './actions'
import type { LeagueHubItem, ActiveSport } from './page'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

// What we get back from previewLeague when the code is valid
type JoinPreview = {
  id:          string
  name:        string
  sportName:   string
  memberCount: number
  maxMembers:  number
}

// Which panel is currently open (none = just the list)
type Panel = 'none' | 'create' | 'join-enter' | 'join-preview'

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------
type Props = {
  leagues:      LeagueHubItem[]
  activeSports: ActiveSport[]
}

// -----------------------------------------------------------------------
// LeaguesHubClient
// -----------------------------------------------------------------------
export default function LeaguesHubClient({ leagues, activeSports }: Props) {
  const router = useRouter()

  // useTransition tracks when a server action is in-flight (running).
  // isPending = true means "waiting for the server to respond".
  const [isPending, startTransition] = useTransition()

  // Which panel (form) is visible
  const [panel, setPanel] = useState<Panel>('none')

  // --- Create form state ---
  const [createName,    setCreateName]    = useState('')
  const [createSportId, setCreateSportId] = useState(activeSports[0]?.id ?? '')
  const [createError,   setCreateError]   = useState<string | null>(null)

  // --- Join form state ---
  const [joinCode,    setJoinCode]    = useState('')
  const [joinError,   setJoinError]   = useState<string | null>(null)
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null)

  // Reset all form state and open a panel
  function openPanel(p: Panel) {
    setCreateName('')
    setCreateSportId(activeSports[0]?.id ?? '')
    setCreateError(null)
    setJoinCode('')
    setJoinError(null)
    setJoinPreview(null)
    setPanel(p)
  }

  // -----------------------------------------------------------------------
  // Create League — form submit handler
  // -----------------------------------------------------------------------
  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreateError(null)
    startTransition(async () => {
      const formData = new FormData(e.currentTarget)
      const result = await createLeague(formData)
      if ('error' in result) {
        setCreateError(result.error ?? 'Unknown error')
      } else {
        // Bust client-side router cache before leaving this page.
        router.refresh()
        // Navigate straight to the new league's detail page
        router.push(`/leagues/${result.groupId}`)
      }
    })
  }

  // -----------------------------------------------------------------------
  // Join League — step 1: look up the code and show a preview
  // -----------------------------------------------------------------------
  function handleJoinPreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setJoinError(null)
    startTransition(async () => {
      const result = await previewLeague(joinCode)
      if (!result.success) {
        setJoinError(result.error ?? 'Unknown error')
      } else {
        setJoinPreview(result.league)
        setPanel('join-preview')
      }
    })
  }

  // -----------------------------------------------------------------------
  // Join League — step 2: user confirmed, actually join.
  // We pass the original join code (still in state) to joinLeague so the
  // DB function can re-validate it atomically — no bypass possible.
  // Navigation uses joinPreview.id which we already have from the preview.
  // -----------------------------------------------------------------------
  function handleJoinConfirm() {
    if (!joinPreview) return
    setJoinError(null)
    startTransition(async () => {
      const result = await joinLeague(joinCode)
      if ('error' in result) {
        setJoinError(result.error ?? 'Unknown error')
        setPanel('join-enter')  // send them back to re-enter code
      } else {
        // Bust client-side router cache before leaving this page.
        router.refresh()
        router.push(`/leagues/${joinPreview.id}`)
      }
    })
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-950 pb-24">

      {/* Page header */}
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-brand-500 text-2xl font-bold tracking-tight">Leagues</h1>
      </div>

      {/* Create / Join buttons */}
      <div className="px-5 pb-4 flex gap-3">
        <button
          onClick={() => openPanel('create')}
          className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold"
        >
          + Create League
        </button>
        <button
          onClick={() => openPanel('join-enter')}
          className="flex-1 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-semibold"
        >
          Join League
        </button>
      </div>

      {/* ---- Create League panel ---- */}
      {panel === 'create' && (
        <div className="mx-5 mb-4 bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
          <h2 className="text-white font-semibold mb-4">Create a League</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">League Name</label>
              <input
                name="name"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="e.g. The Gridiron Gang"
                maxLength={50}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Sport</label>
              {activeSports.length === 0 ? (
                <p className="text-zinc-500 text-sm">No active sports available.</p>
              ) : (
                <select
                  name="sport_id"
                  value={createSportId}
                  onChange={e => setCreateSportId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-500"
                >
                  {activeSports.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>

            {createError && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3">
                <p className="text-red-300 text-xs font-semibold mb-1">League creation failed</p>
                <p className="text-red-200 text-xs whitespace-pre-wrap break-words">{createError}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPanel('none')}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || activeSports.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {isPending ? 'Creating…' : 'Create League'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Join League panel — step 1: enter code ---- */}
      {panel === 'join-enter' && (
        <div className="mx-5 mb-4 bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
          <h2 className="text-white font-semibold mb-1">Join a League</h2>
          <p className="text-zinc-500 text-xs mb-4">Enter the 6-character code from your friend.</p>
          <form onSubmit={handleJoinPreview} className="flex flex-col gap-3">

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Join Code</label>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 6))}
                placeholder="e.g. XK9T2A"
                maxLength={6}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm font-mono tracking-[0.3em] uppercase placeholder:text-zinc-600 placeholder:tracking-normal focus:outline-none focus:border-brand-500"
              />
            </div>

            {joinError && (
              <p className="text-red-400 text-xs">{joinError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPanel('none')}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || joinCode.length < 6}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {isPending ? 'Looking up…' : 'Find League'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Join League panel — step 2: preview + confirm ---- */}
      {panel === 'join-preview' && joinPreview && (
        <div className="mx-5 mb-4 bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
          <h2 className="text-white font-semibold mb-4">Join This League?</h2>

          {/* League preview card */}
          <div className="bg-zinc-800/60 rounded-xl p-4 mb-4">
            <p className="text-white font-semibold text-lg leading-tight">{joinPreview.name}</p>
            <p className="text-zinc-400 text-sm mt-0.5">{joinPreview.sportName}</p>
            <p className="text-zinc-500 text-xs mt-1">
              {joinPreview.memberCount} / {joinPreview.maxMembers} members
            </p>
          </div>

          {joinError && (
            <p className="text-red-400 text-xs mb-3">{joinError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setPanel('join-enter')}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
            >
              Back
            </button>
            <button
              onClick={handleJoinConfirm}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? 'Joining…' : 'Confirm & Join'}
            </button>
          </div>
        </div>
      )}

      {/* ---- League list ---- */}
      <div className="px-5 flex flex-col gap-3">
        {leagues.length === 0 ? (
          // Empty state — user is not in any leagues yet
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-white font-bold text-xl mb-2">No Leagues Yet</h2>
            <p className="text-zinc-500 text-sm max-w-xs">
              Create a league to compete with friends, or tap &quot;Join League&quot; and enter a code.
            </p>
          </div>
        ) : (
          leagues.map(league => (
            <LeagueCard key={league.id} league={league} />
          ))
        )}
      </div>
    </div>
  )
}
