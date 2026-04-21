'use client'
// src/app/(app)/leaderboard/LeaderboardClient.tsx
//
// The interactive shell for the global leaderboard page.
//
// The server component (page.tsx) does all the database work and passes
// pre-computed standings here as props. This component handles:
//   - Sport pill selection (College Football | NFL | … | Overall)
//   - Sort toggle (Points vs Accuracy)
//   - Rendering the standings table
//   - Pinned row for users outside the top 100

import { useState, useMemo } from 'react'
import type { StandingRow, SportOption, LeaderboardView } from './page'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
type Props = {
  sports:        SportOption[]                    // pills to show (in order)
  views:         Record<string, LeaderboardView>  // pre-computed standings keyed by slug
  currentUserId: string
}

// The two ways to rank the list
type SortKey = 'points' | 'accuracy'

// -----------------------------------------------------------------------
// LeaderboardClient
// -----------------------------------------------------------------------
export default function LeaderboardClient({ sports, views, currentUserId }: Props) {
  // Which pill is active — default to the first sport (not Overall)
  const [selectedSlug, setSelectedSlug] = useState<string>(
    sports[0]?.slug ?? 'overall'
  )

  // Which column to sort by — default to points
  const [sortKey, setSortKey] = useState<SortKey>('points')

  // When the user switches pills, reset the sort to points (default)
  function selectPill(slug: string) {
    setSelectedSlug(slug)
    setSortKey('points')
  }

  // The data for the currently selected view (sport or overall)
  const currentView = views[selectedSlug] ?? { standings: [], pinnedRow: null }

  // -----------------------------------------------------------------------
  // Client-side re-sort when the user clicks "Sort: Accuracy"
  //
  // The server always sends standings sorted by points (the default).
  // When the user clicks "Sort: Accuracy", we re-order the same data in
  // the browser — no new database call needed. This makes the toggle instant.
  //
  // useMemo means: only re-calculate when the standings data or sort key changes.
  // -----------------------------------------------------------------------
  const sortedStandings = useMemo(() => {
    const copy = [...currentView.standings]

    if (sortKey === 'accuracy') {
      // Sort by accuracy desc; break ties by total points desc
      copy.sort((a, b) => b.accuracy - a.accuracy || b.totalPoints - a.totalPoints)

      // Re-assign rank numbers based on the new accuracy order.
      // Ties in accuracy share the same rank number.
      let rank = 1
      return copy.map((row, i) => {
        if (i > 0 && row.accuracy < copy[i - 1].accuracy) rank = i + 1
        return { ...row, rank }
      })
    }

    // Default (points): already sorted correctly by the server
    return copy
  }, [currentView.standings, sortKey])

  // The pinned row (shown above the list when user is outside top 100).
  // When sorted by accuracy, we keep the pinned row but note that the rank
  // number shown is still the user's points-based rank — computing an exact
  // accuracy rank would require data on every user beyond the top 100.
  const pinnedRow = currentView.pinnedRow

  // -----------------------------------------------------------------------
  // All pill definitions: each active sport + "Overall" at the end
  // -----------------------------------------------------------------------
  const pills = [
    ...sports.map(s => ({ label: s.name, slug: s.slug })),
    { label: 'Overall', slug: 'overall' },
  ]

  // -----------------------------------------------------------------------
  // Empty state: no seasons have started for any sport
  // -----------------------------------------------------------------------
  if (sports.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 pb-24">
        <div className="px-5 pt-4 pb-4">
          <h1 className="text-brand-500 text-2xl font-bold tracking-tight">Leaderboard</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="text-4xl mb-4">📅</div>
          <h2 className="text-white font-bold text-xl mb-2">No Active Season</h2>
          <p className="text-zinc-500 text-sm max-w-xs">
            Leaderboards will appear once a season has started.
          </p>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-950 pb-24">

      {/* Page header */}
      <div className="px-5 pt-4 pb-3">
        <h1 className="text-brand-500 text-2xl font-bold tracking-tight">Leaderboard</h1>
      </div>

      {/* ---- Sport pills ---- */}
      {/* Same pill style as the picks page sport-switcher row */}
      <div className="px-5 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {pills.map(pill => (
          <button
            key={pill.slug}
            onClick={() => selectPill(pill.slug)}
            className={`
              flex-none px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
              ${selectedSlug === pill.slug
                ? 'bg-brand-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}
            `}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* ---- Sort toggle ---- */}
      {/* Two small buttons that re-rank the list by points (default) or accuracy % */}
      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={() => setSortKey('points')}
          className={`
            px-3 py-1 rounded-full text-xs font-semibold transition-colors
            ${sortKey === 'points'
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300'}
          `}
        >
          Points
        </button>
        <button
          onClick={() => setSortKey('accuracy')}
          className={`
            px-3 py-1 rounded-full text-xs font-semibold transition-colors
            ${sortKey === 'accuracy'
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300'}
          `}
        >
          Accuracy
        </button>
      </div>

      {/* ---- Standings ---- */}
      {sortedStandings.length === 0 ? (
        // No scored picks yet for this sport/view
        <div className="px-5 py-10 text-center">
          <div className="text-3xl mb-3">🏆</div>
          <p className="text-white font-semibold">No Picks Scored Yet</p>
          <p className="text-zinc-500 text-sm mt-1">
            Check back once the first games have finished.
          </p>
        </div>
      ) : (
        <div className="px-5">

          {/* Pinned user row — only shown when user is outside top 100 */}
          {pinnedRow && (
            <>
              <StandingRowCard row={pinnedRow} currentUserId={currentUserId} />
              {/* Divider separating the pinned row from the top-100 list */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 border-t border-zinc-800" />
                <span className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wider">
                  Top 100
                </span>
                <div className="flex-1 border-t border-zinc-800" />
              </div>
            </>
          )}

          {/* Column header row — matches the league leaderboard header exactly */}
          <div className="grid grid-cols-[2rem_1fr_4rem_4rem] gap-2 px-3 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              #
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Player
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 text-right">
              Acc%
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 text-right">
              Pts
            </span>
          </div>

          {/* Standings rows */}
          <div className="flex flex-col gap-1.5">
            {sortedStandings.map(row => (
              <StandingRowCard
                key={row.userId}
                row={row}
                currentUserId={currentUserId}
              />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// StandingRowCard
//
// A single row in the standings table. Extracted as its own component so
// the same card can be used for both the pinned user row and the main list
// without repeating the JSX.
//
// Visual rules (matching the league leaderboard exactly):
//   - Rank #1, #2, #3 → rank number in brand purple
//   - Logged-in user's row → purple background tint + "(you)" label + purple points
//   - Everyone else → dark zinc card
// -----------------------------------------------------------------------
function StandingRowCard({
  row,
  currentUserId,
}: {
  row:           StandingRow
  currentUserId: string
}) {
  const isMe = row.userId === currentUserId

  return (
    <div
      className={`
        grid grid-cols-[2rem_1fr_4rem_4rem] gap-2 items-center px-3 py-3 rounded-xl
        ${isMe
          ? 'bg-brand-500/10 border border-brand-500/20'
          : 'bg-zinc-900 border border-zinc-800'}
      `}
    >
      {/* Rank — top 3 in brand purple, everyone else in muted zinc */}
      <span className={`text-sm font-bold ${row.rank <= 3 ? 'text-brand-400' : 'text-zinc-500'}`}>
        {row.rank}
      </span>

      {/* Username — white for current user, slightly dimmer for others */}
      <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-zinc-200'}`}>
        {row.username}
        {isMe && (
          <span className="ml-1 text-zinc-600 text-xs font-normal">(you)</span>
        )}
      </span>

      {/* Accuracy % — dash if the user has no finished picks yet */}
      <span className="text-sm text-zinc-400 text-right">
        {row.finishedPicks > 0 ? `${row.accuracy}%` : '—'}
      </span>

      {/* Total points — brand purple for current user, white for others */}
      <span className={`text-sm font-semibold text-right ${isMe ? 'text-brand-400' : 'text-white'}`}>
        {row.totalPoints}
      </span>
    </div>
  )
}
