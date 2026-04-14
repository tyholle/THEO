'use client'
// src/app/admin/components/ScoresTab.tsx
// UI for Section 3: Score Management.
//
// Features:
//   - "Refresh Scores" button: fetches ESPN for all games in the current week
//   - Manual score override: admin enters scores directly for any game
//   - Score table showing all games in the current week with current scores

import { useState, useTransition } from 'react'
import { refreshScores, manualScoreOverride } from '../actions/scores'
import type { Game } from './AdminShell'

type Props = {
  currentWeekGames: Game[]
}

function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
  if (success) return <p className="text-sm text-brand-400 bg-brand-900/30 border border-brand-800 rounded-lg px-3 py-2">{success}</p>
  return null
}

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  })
}

export default function ScoresTab({ currentWeekGames }: Props) {
  const [isPending, startTransition] = useTransition()
  const [refreshMsg, setRefreshMsg]   = useState<{ error?: string; success?: string }>({})
  const [overrideMsg, setOverrideMsg] = useState<{ error?: string; success?: string }>({})

  // ---- Refresh scores ----
  function handleRefresh() {
    setRefreshMsg({})
    startTransition(async () => {
      const result = await refreshScores()
      if ('error' in result && result.error) {
        setRefreshMsg({ error: result.error })
      } else if ('success' in result) {
        setRefreshMsg({ success: (result as { success: boolean; message: string }).message })
      }
    })
  }

  // ---- Manual score override ----
  function handleOverride(fd: FormData) {
    setOverrideMsg({})
    startTransition(async () => {
      const result = await manualScoreOverride(fd)
      if ('error' in result && result.error) {
        setOverrideMsg({ error: result.error })
      } else {
        setOverrideMsg({ success: 'Scores updated!' })
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Score Management</h2>

      {/* ---- Refresh Scores ---- */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Refresh Scores from ESPN</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Fetches live scores for all games in the current week. Any game that finishes will
          automatically have its ATS result calculated and points written to all picks.
        </p>
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#5c5bf0] text-white font-medium text-sm
                     hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Refreshing…' : 'Refresh Scores'}
        </button>
        <div className="mt-3">
          <Message {...refreshMsg} />
        </div>
      </div>

      {/* ---- Manual Score Override ---- */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Manual Score Override</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Enter scores directly for any game. Check &quot;Mark as Final&quot; to trigger ATS
          calculation and write points to all picks for that game.
        </p>
        <form action={handleOverride} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Game</label>
            <select name="game_id" required
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                         text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— Select a game —</option>
              {currentWeekGames
                .filter(g => g.status !== 'void')
                .map(g => (
                  <option key={g.id} value={g.id}>
                    {g.away_team} at {g.home_team} ({g.status})
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Home Score</label>
              <input name="home_score" type="number" min="0" required placeholder="0"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Away Score</label>
              <input name="away_score" type="number" min="0" required placeholder="0"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="set_final" name="set_final" value="true"
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-brand-500" />
            <label htmlFor="set_final" className="text-sm text-zinc-300">
              Mark as Final (will calculate ATS result and write points to all picks)
            </label>
          </div>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 rounded-lg bg-zinc-700 text-zinc-100 font-medium text-sm
                       hover:bg-zinc-600 transition-colors disabled:opacity-50">
            {isPending ? 'Updating…' : 'Update Scores'}
          </button>
          <Message {...overrideMsg} />
        </form>
      </div>

      {/* ---- Current week scores table ---- */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300">Current Week Score Board</h3>
        </div>

        {currentWeekGames.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500 text-center">No games in the current week.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-3">Matchup</th>
                <th className="px-4 py-3">Spread</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ATS Result</th>
                <th className="px-4 py-3">Kickoff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {currentWeekGames.map(game => {
                const favoredTeam = game.spread_favors === 'home' ? game.home_team : game.away_team
                const hasScore = game.home_score !== null && game.away_score !== null
                return (
                  <tr key={game.id} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-3 text-zinc-200">
                      {game.away_team} <span className="text-zinc-500">at</span> {game.home_team}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {favoredTeam} {game.spread}
                    </td>
                    <td className="px-4 py-3 text-zinc-200 font-mono">
                      {hasScore
                        ? `${game.home_score}–${game.away_score}`
                        : '–'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        game.status === 'final'      ? 'bg-zinc-700 text-zinc-300' :
                        game.status === 'in_progress' ? 'bg-brand-900/50 text-brand-400' :
                        game.status === 'void'        ? 'bg-red-900/50 text-red-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>
                        {game.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {game.ats_result ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {formatKickoff(game.kickoff_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
