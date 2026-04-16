'use client'
// src/app/picks/PicksClient.tsx
//
// The "brain" of the picks page. This is a Client Component — it runs
// in the user's browser and handles all the interactive parts:
//
//   - Holds all pick data in local state (React's useState)
//   - Updates the UI immediately when the user taps a team (optimistic)
//   - Saves picks to the database in the background (Supabase client)
//   - Handles switching picks, removing picks, and double-down
//   - Renders the week strip, game heading, and all game cards
//
// "Optimistic update" means: we update what the user sees right away,
// then confirm with the database. If the database call fails, we
// revert the UI back to where it was. This makes the app feel instant.

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import WeekStrip from './WeekStrip'
import GameCard from './GameCard'
import type { WeekRow, GameRow, PickRow, SportEntry } from './page'

// -----------------------------------------------------------------------
// Props passed in from the server component (page.tsx)
// -----------------------------------------------------------------------
type Props = {
  userId: string             // The logged-in user's ID (from Supabase Auth)
  sportSlug: string          // e.g. "cfb" — used for sport-switcher navigation
  allActiveSports: SportEntry[]  // All currently active sports (for the sport row)
  showSportRow: boolean      // Whether to show the multi-sport selector (2+ sports)
  weeks: WeekRow[]
  selectedWeekNumber: number
  games: GameRow[]
  initialPicks: PickRow[]    // Picks already saved in the DB for this week
}

// -----------------------------------------------------------------------
// PicksClient
// -----------------------------------------------------------------------
export default function PicksClient({
  userId,
  sportSlug,
  allActiveSports,
  showSportRow,
  weeks,
  selectedWeekNumber,
  games,
  initialPicks,
}: Props) {
  // The Supabase browser client — created once and reused across all interactions.
  // useMemo ensures we don't create a new client on every state update.
  const supabase = useMemo(() => createClient(), [])
  // Router used for sport-switching navigation and background refresh
  const router = useRouter()

  // -----------------------------------------------------------------------
  // Error state — shown when a pick fails to save
  // -----------------------------------------------------------------------
  const [saveError, setSaveError] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Pending picks — tracks game IDs where a pick save is in flight.
  // Used to block double-down until the DB has confirmed the pick and
  // returned a real row ID (vs. the temporary one we assign optimistically).
  // -----------------------------------------------------------------------
  const [pendingPicks, setPendingPicks] = useState<Set<string>>(new Set())

  // -----------------------------------------------------------------------
  // Auto-refresh when games are active
  //
  // We poll every 90 seconds when any game on this page is either:
  //   - currently in_progress (live score showing), OR
  //   - past its kickoff time (should be live even if DB hasn't updated yet)
  //
  // This fixes the case where the user loads the page while games are still
  // "scheduled" in the DB, then they go live — without this check, polling
  // would never start and scores would stay stale until a manual reload.
  //
  // router.refresh() re-runs the server component to pull fresh DB data
  // without losing the user's local pick state.
  // -----------------------------------------------------------------------
  const shouldPoll = games.some(
    g => g.status === 'in_progress' ||
         (g.status === 'scheduled' && new Date(g.kickoff_at).getTime() <= Date.now())
  )

  useEffect(() => {
    if (!shouldPoll) return

    const interval = setInterval(() => {
      router.refresh()
    }, 90 * 1000) // every 90 seconds

    return () => clearInterval(interval)
  }, [shouldPoll, router])

  // -----------------------------------------------------------------------
  // Pick state
  //
  // We store picks as a "map" — an object where the key is the game ID
  // and the value is the pick row. This lets us look up any game's pick
  // in O(1) time: picks[game.id]
  //
  // Initialized from the server-fetched picks so the page shows correctly
  // on first load (e.g. if the user already picked some games).
  // -----------------------------------------------------------------------
  const [picks, setPicks] = useState<Record<string, PickRow>>(
    () => Object.fromEntries(initialPicks.map(p => [p.game_id, p]))
  )

  // -----------------------------------------------------------------------
  // handlePick
  // Called when the user taps one of the two team buttons on a game card.
  //
  // Flow:
  //   1. If they already picked this team, do nothing.
  //   2. Optimistically update the local UI immediately.
  //   3. Upsert (insert or update) the pick in the database.
  //   4. If the DB call fails, revert the UI to its previous state.
  //   5. If it succeeds, update the UI with the DB-confirmed data (gets the real ID).
  // -----------------------------------------------------------------------
  async function handlePick(gameId: string, pickedTeam: 'home' | 'away', weekId: string) {
    const existing = picks[gameId]

    // Already picked this exact team — nothing to do
    if (existing?.picked_team === pickedTeam) return

    // Build what the new pick will look like (before DB confirmation)
    const optimisticPick: PickRow = {
      id: existing?.id ?? crypto.randomUUID(), // temporary ID until DB responds
      user_id: userId,
      game_id: gameId,
      week_id: weekId,
      picked_team: pickedTeam,
      is_double_down: existing?.is_double_down ?? false,
      points_earned: null,
    }

    // Show the pick immediately and mark it as pending (DB not confirmed yet)
    setSaveError(null)
    setPicks(prev => ({ ...prev, [gameId]: optimisticPick }))
    setPendingPicks(prev => new Set(Array.from(prev).concat(gameId)))

    const { data, error } = await supabase
      .from('picks')
      .upsert(
        {
          user_id: userId,
          game_id: gameId,
          week_id: weekId,
          picked_team: pickedTeam,
          is_double_down: existing?.is_double_down ?? false,
        },
        { onConflict: 'user_id,game_id' }
      )
      .select()
      .single()

    // Pick is no longer in-flight — remove from pending set
    setPendingPicks(prev => {
      const next = new Set(prev)
      next.delete(gameId)
      return next
    })

    if (error) {
      // DB failed — revert the UI and tell the user
      console.error('Failed to save pick:', error.message)
      setSaveError('Pick failed to save — please try again.')
      setPicks(prev => {
        const next = { ...prev }
        if (existing) {
          next[gameId] = existing
        } else {
          delete next[gameId]
        }
        return next
      })
    } else if (data) {
      // Confirmed — replace temp ID with the real DB row ID
      setPicks(prev => ({ ...prev, [gameId]: data as PickRow }))
    }
  }

  // -----------------------------------------------------------------------
  // handleRemovePick
  // Deletes the user's pick for a game. Only callable before lock time
  // (the GameCard component hides the "Remove" button after lock).
  // -----------------------------------------------------------------------
  async function handleRemovePick(gameId: string) {
    const existing = picks[gameId]
    if (!existing) return

    // Optimistically remove from UI
    setPicks(prev => {
      const next = { ...prev }
      delete next[gameId]
      return next
    })

    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('game_id', gameId)
      .eq('user_id', userId)

    if (error) {
      // Revert — put the pick back and tell the user
      console.error('Failed to remove pick:', error.message)
      setSaveError('Could not remove pick — please try again.')
      setPicks(prev => ({ ...prev, [gameId]: existing }))
    }
  }

  // -----------------------------------------------------------------------
  // handleDoubleDown
  // Toggles the double-down on a specific game.
  //
  // Rules:
  //   - Only one double-down per week is allowed.
  //   - If turning ON: first turn OFF any existing double-down on another game.
  //   - If turning OFF: just un-mark this game.
  //
  // The database has a partial unique index that enforces this at the DB level
  // too — but we handle it in app code to give a smooth UI experience.
  // -----------------------------------------------------------------------
  async function handleDoubleDown(gameId: string) {
    const pick = picks[gameId]
    // Block if there's no pick, or if the pick is still being saved to the DB.
    // A pending pick has a temporary ID — the DB update would silently do nothing.
    if (!pick?.id) return
    if (pendingPicks.has(gameId)) return

    const willBeActive = !pick.is_double_down

    // Capture the previous double-down game BEFORE we change anything.
    // We need this reference so we can restore it if something goes wrong later.
    const previousDD = willBeActive
      ? Object.values(picks).find(p => p.game_id !== gameId && p.is_double_down)
      : null

    // ---- Step A: If turning ON, find and turn OFF any existing double-down ----
    if (willBeActive && previousDD) {
      // Optimistically remove the old double-down from UI
      setPicks(prev => ({
        ...prev,
        [previousDD.game_id]: { ...previousDD, is_double_down: false },
      }))

      const { error: stepAError } = await supabase
        .from('picks')
        .update({ is_double_down: false })
        .eq('id', previousDD.id)

      // If Step A failed, revert the optimistic UI change and stop here.
      // Don't proceed to Step B — otherwise the user ends up with two
      // double-downs shown in the UI even though neither saved correctly.
      if (stepAError) {
        console.error('Failed to clear previous double down:', stepAError.message)
        setSaveError('Could not update double down — please try again.')
        setPicks(prev => ({
          ...prev,
          [previousDD.game_id]: { ...previousDD, is_double_down: true },
        }))
        return
      }
    }

    // ---- Step B: Update this pick's double-down state ----
    // Optimistic UI update
    setPicks(prev => ({
      ...prev,
      [gameId]: { ...pick, is_double_down: willBeActive },
    }))

    const { error } = await supabase
      .from('picks')
      .update({ is_double_down: willBeActive })
      .eq('id', pick.id)

    if (error) {
      // Step B failed — revert this game's pick back to its original state
      console.error('Failed to update double down:', error.message)
      setSaveError('Could not update double down — please try again.')
      setPicks(prev => ({ ...prev, [gameId]: pick }))

      // Also restore the previous double-down if we already turned it off in Step A.
      // Without this, the user would end up with no double-down for the week.
      if (previousDD) {
        setPicks(prev => ({
          ...prev,
          [previousDD.game_id]: { ...previousDD, is_double_down: true },
        }))
        // Restore it in the database too
        await supabase
          .from('picks')
          .update({ is_double_down: true })
          .eq('id', previousDD.id)
      }
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    // min-h-screen fills the full viewport height.
    // pb-28 adds bottom padding so the last game card isn't hidden behind the nav.
    <div className="pb-28">

      {/* ---- Page header (week strip lives below shared app header) ---- */}
      <div className="px-5 pt-4 pb-2">

        {/* Sport row — only shown when 2+ sports are active.
            Clicking a sport navigates to ?sport=nfl (dropping the ?week param
            so the page defaults to the current week for that sport). */}
        {showSportRow && (
          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {allActiveSports.map(s => (
              <button
                key={s.id}
                onClick={() => router.push(`/picks?sport=${s.slug}`)}
                className={`flex-none px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  s.slug === sportSlug
                    ? 'bg-brand-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Week selector strip */}
        <div className="mt-3">
          <WeekStrip weeks={weeks} selectedWeekNumber={selectedWeekNumber} sportSlug={sportSlug} />
        </div>
      </div>

      {/* ---- Week heading ---- */}
      <div className="px-5 pt-4 pb-5">
        <h2 className="text-white text-3xl font-black tracking-tight">
          WEEK {selectedWeekNumber}
        </h2>
        <p className="text-zinc-600 text-xs mt-1">
          Make your picks for the biggest games of the week
        </p>
      </div>

      {/* ---- Save error banner ---- */}
      {saveError && (
        <div className="mx-4 mb-2 px-4 py-3 rounded-xl bg-red-900/40 border border-red-800 flex items-center justify-between gap-3">
          <p className="text-red-300 text-sm">{saveError}</p>
          <button
            onClick={() => setSaveError(null)}
            className="text-red-400 hover:text-red-200 text-lg leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {/* ---- Game cards ---- */}
      <div className="px-4 space-y-3">
        {games.length === 0 ? (
          // Empty state: no games added for this week yet
          <EmptySlate />
        ) : (
          games.map(game => (
            <GameCard
              key={game.id}
              game={game}
              pick={picks[game.id] ?? null}
              isPending={pendingPicks.has(game.id)}
              onPick={(team) => handlePick(game.id, team, game.week_id)}
              onRemovePick={() => handleRemovePick(game.id)}
              onDoubleDown={() => handleDoubleDown(game.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// EmptySlate
// Shown when the selected week has no games added yet.
// -----------------------------------------------------------------------
function EmptySlate() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      {/* Football emoji as a friendly visual */}
      <div className="text-5xl mb-5">🏈</div>
      <h3 className="text-white font-bold text-xl mb-2">
        New Slate Coming Soon...
      </h3>
      <p className="text-zinc-500 text-sm max-w-xs">
        Games will appear here once they&apos;re added. Check back before kickoff.
      </p>
    </div>
  )
}
