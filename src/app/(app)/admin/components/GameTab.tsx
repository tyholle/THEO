'use client'
// src/app/admin/components/GameTab.tsx
// UI for Section 2: Game Management.
//
// Features:
//   - ESPN auto-fill: type a game ID and click "Look Up" to auto-fill teams + kickoff
//   - Add Game form
//   - Table of games in the current week with Edit, Delete, Void actions
//   - Edit is hidden if game is within 15 minutes of kickoff; Delete stays available

import { useState, useTransition } from 'react'
import { lookupEspnGame, createGame, updateGame, deleteGame, voidGame } from '../actions/game'
import type { Sport, Season, Week, Game } from './AdminShell'

type Props = {
  sports: Sport[]
  seasons: Season[]
  weeks: Week[]
  currentWeekGames: Game[]
  currentWeekId: string | null
}

// -----------------------------------------------------------------------
// Format helpers
// -----------------------------------------------------------------------
function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    timeZoneName: 'short',
  })
}

function isLocked(kickoffAt: string) {
  return Date.now() >= new Date(kickoffAt).getTime() - 15 * 60 * 1000
}

// -----------------------------------------------------------------------
// Reusable sub-components
// -----------------------------------------------------------------------
function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-2">{error}</p>
  if (success) return <p className="text-sm text-brand-400 bg-brand-900/30 border border-brand-800 rounded-lg px-3 py-2 mt-2">{success}</p>
  return null
}

// -----------------------------------------------------------------------
// EditGameRow — inline edit form for a single game
// -----------------------------------------------------------------------
function EditGameRow({
  game, onCancel, onSave, unavailablePointValues,
}: {
  game: Game
  onCancel: () => void
  onSave: (formData: FormData) => void
  // Point values already taken by OTHER games in the same week.
  // This game's own current value is excluded so it can be re-selected.
  unavailablePointValues: number[]
}) {
  // Values 1–10 that are still available (not taken by other games this week)
  const availableValues = Array.from({ length: 10 }, (_, i) => i + 1)
    .filter(v => !unavailablePointValues.includes(v))

  return (
    <tr className="bg-zinc-800/60">
      <td colSpan={7} className="px-4 py-4">
        <form
          action={(fd) => onSave(fd)}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Home Team</label>
            <input name="home_team" defaultValue={game.home_team} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Away Team</label>
            <input name="away_team" defaultValue={game.away_team} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Spread (e.g. -7.5)</label>
            <input name="spread" type="number" step="0.5" defaultValue={game.spread} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Spread Favors</label>
            <select name="spread_favors" defaultValue={game.spread_favors} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Point Value</label>
            <select name="point_value" defaultValue={game.point_value} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500">
              {availableValues.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Kickoff Time</label>
            <input name="kickoff_at" type="datetime-local" defaultValue={game.kickoff_at.slice(0, 16)} required
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">ESPN Game ID</label>
            <input name="espn_game_id" defaultValue={game.espn_game_id ?? ''}
              className="w-full rounded bg-zinc-700 border border-zinc-600 px-2 py-1 text-sm text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit"
              className="px-3 py-1.5 rounded bg-brand-500 text-white font-medium text-xs hover:bg-brand-400">
              Save Changes
            </button>
            <button type="button" onClick={onCancel}
              className="px-3 py-1.5 rounded bg-zinc-600 text-zinc-200 text-xs hover:bg-zinc-500">
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------
export default function GameTab({ sports, seasons, weeks, currentWeekGames, currentWeekId }: Props) {
  const [isPending, startTransition] = useTransition()

  // Which sport the admin has selected for the ESPN lookup.
  // Defaults to the first sport's slug (usually 'cfb'), or '' if no sports exist.
  const [selectedSportSlug, setSelectedSportSlug] = useState<string>(
    sports[0]?.slug ?? ''
  )

  // ESPN auto-fill state
  const [espnId, setEspnId]       = useState('')
  const [autoFilled, setAutoFilled] = useState<{
    homeTeam: string; awayTeam: string; kickoffAt: string
  } | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Form feedback
  const [addMsg, setAddMsg]     = useState<{ error?: string; success?: string }>({})
  const [rowMsgs, setRowMsgs]   = useState<Record<string, { error?: string; success?: string }>>({})

  // Which game row is being edited
  const [editingId, setEditingId] = useState<string | null>(null)

  // Track which week the admin has selected in the Add Game form.
  // We use this to know which point values are already taken in that week,
  // so we can show only the available options in the dropdown.
  // Defaults to the current week so the dropdown is useful immediately.
  const [selectedFormWeekId, setSelectedFormWeekId] = useState<string>(currentWeekId ?? '')

  // Point values 1–10 that are still available in the selected Add form week.
  // We only know which values are taken for the current week (currentWeekGames).
  // For other weeks, we show all 1–10 and rely on the server to reject duplicates.
  const takenInSelectedWeek = selectedFormWeekId === currentWeekId
    ? currentWeekGames.map(g => g.point_value)
    : []
  const availableAddValues = Array.from({ length: 10 }, (_, i) => i + 1)
    .filter(v => !takenInSelectedWeek.includes(v))

  // ---- ESPN lookup ----
  function handleLookup() {
    if (!espnId.trim() || !selectedSportSlug) return
    setLookupError(null)
    setAutoFilled(null)
    startTransition(async () => {
      // Pass the selected sport slug so the server knows which ESPN endpoint to call
      const result = await lookupEspnGame(espnId.trim(), selectedSportSlug)
      if ('error' in result && result.error) {
        setLookupError(result.error)
      } else if ('success' in result) {
        setAutoFilled({
          homeTeam: result.homeTeam!,
          awayTeam: result.awayTeam!,
          kickoffAt: result.kickoffAt!,
        })
      }
    })
  }

  // ---- Add game form submit ----
  function handleAddGame(fd: FormData) {
    setAddMsg({})
    startTransition(async () => {
      const result = await createGame(fd)
      if ('error' in result && result.error) {
        setAddMsg({ error: result.error })
      } else {
        setAddMsg({ success: 'Game added!' })
        setEspnId('')
        setAutoFilled(null)
      }
    })
  }

  // ---- Edit save ----
  function handleEditSave(gameId: string, fd: FormData) {
    startTransition(async () => {
      const result = await updateGame(gameId, fd)
      if ('error' in result && result.error) {
        setRowMsgs(prev => ({ ...prev, [gameId]: { error: result.error } }))
      } else {
        setEditingId(null)
      }
    })
  }

  // ---- Delete ----
  function handleDelete(gameId: string, homeTeam: string, awayTeam: string) {
    if (!confirm(
      `Delete ${awayTeam} at ${homeTeam}? This removes the game and all picks on it. This cannot be undone.`,
    )) return
    startTransition(async () => {
      const result = await deleteGame(gameId)
      if ('error' in result && result.error) {
        setRowMsgs(prev => ({ ...prev, [gameId]: { error: result.error } }))
      }
    })
  }

  // ---- Void ----
  function handleVoid(gameId: string, homeTeam: string, awayTeam: string) {
    if (!confirm(`Void ${awayTeam} at ${homeTeam}? This will set points_earned = 0 for all picks on this game.`)) return
    startTransition(async () => {
      const result = await voidGame(gameId)
      if ('error' in result && result.error) {
        setRowMsgs(prev => ({ ...prev, [gameId]: { error: result.error } }))
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Game Management</h2>

      {/* ---- Add Game Form ---- */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Add Game</h3>

        {/* Step 1: Select sport + ESPN ID lookup */}
        <div className="mb-4 p-4 bg-zinc-800/60 rounded-lg border border-zinc-700">
          <p className="text-xs text-zinc-400 mb-3">
            Step 1: Select the sport, then enter the ESPN Game ID to auto-fill team names and kickoff time.
            Find the ID in the ESPN game URL (the number at the end).
          </p>

          {/* Sport selector — determines which ESPN API URL to call */}
          <div className="mb-3">
            <label className="block text-xs text-zinc-400 mb-1">Sport</label>
            <select
              value={selectedSportSlug}
              onChange={e => {
                setSelectedSportSlug(e.target.value)
                // Clear auto-fill when sport changes — old result was for a different sport
                setAutoFilled(null)
                setLookupError(null)
              }}
              className="w-full rounded-lg bg-zinc-700 border border-zinc-600 px-3 py-2
                         text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Select sport —</option>
              {sports.map(s => (
                <option key={s.id} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <input
              value={espnId}
              onChange={e => setEspnId(e.target.value)}
              placeholder="e.g. 401628423"
              className="flex-1 rounded-lg bg-zinc-700 border border-zinc-600 px-3 py-2
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={handleLookup}
              disabled={isPending || !espnId.trim() || !selectedSportSlug}
              className="px-4 py-2 rounded-lg bg-zinc-600 text-zinc-100 text-sm font-medium
                         hover:bg-zinc-500 disabled:opacity-50"
            >
              {isPending ? 'Looking up…' : 'Look Up'}
            </button>
          </div>
          {lookupError && <p className="text-sm text-red-400 mt-2">{lookupError}</p>}
          {autoFilled && (
            <p className="text-sm text-brand-400 mt-2">
              Found: {autoFilled.awayTeam} at {autoFilled.homeTeam} — {formatKickoff(autoFilled.kickoffAt)}
            </p>
          )}
        </div>

        {/* Step 2: Full game form — only shows after a successful ESPN lookup */}
        {autoFilled && (
          <form action={handleAddGame} className="space-y-3">
            {/* Hidden fields from ESPN auto-fill and sport selection */}
            <input type="hidden" name="home_team" value={autoFilled.homeTeam} />
            <input type="hidden" name="away_team" value={autoFilled.awayTeam} />
            <input type="hidden" name="kickoff_at" value={autoFilled.kickoffAt} />
            <input type="hidden" name="espn_game_id" value={espnId} />
            {/* sport_slug tells the server which ESPN API URL to use when saving logos */}
            <input type="hidden" name="sport_slug" value={selectedSportSlug} />

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Week</label>
              <select
                name="week_id"
                required
                value={selectedFormWeekId}
                onChange={e => setSelectedFormWeekId(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">— Select week —</option>
                {weeks.map(w => {
                  // Show the season name alongside the week label so it's clear
                  // which sport this week belongs to, e.g. "2025 CFB Season — Week 1"
                  const season = seasons.find(s => s.id === w.season_id)
                  const sport  = season ? sports.find(sp => sp.id === season.sport_id) : null
                  const label  = sport ? `${sport.slug.toUpperCase()} · ${w.label}` : w.label
                  return (
                    <option key={w.id} value={w.id}>{label}</option>
                  )
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Spread (negative = favored, e.g. -7.5)
                </label>
                <input name="spread" type="number" step="0.5" required placeholder="-7.5"
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                             text-sm text-zinc-100 placeholder-zinc-500
                             focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Spread Favors (which team is -7.5?)
                </label>
                <select name="spread_favors" required
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                             text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="home">Home — {autoFilled.homeTeam}</option>
                  <option value="away">Away — {autoFilled.awayTeam}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Point Value (1–10, higher = more important game)
              </label>
              {/* Only values not yet taken in the selected week are shown.
                  If a different week is selected (not current), all 1–10 are available
                  since we don't have that week's games loaded — server enforces uniqueness. */}
              <select name="point_value" required
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">— Select value —</option>
                {availableAddValues.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={isPending}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-400 transition-colors disabled:opacity-50">
              {isPending ? 'Adding…' : 'Add Game'}
            </button>
            <Message {...addMsg} />
          </form>
        )}
      </div>

      {/* ---- Current week's games table ---- */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300">Current Week Games</h3>
        </div>

        {currentWeekGames.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500 text-center">
            No games yet for the current week.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-3">Matchup</th>
                <th className="px-4 py-3">Spread</th>
                <th className="px-4 py-3">Pts</th>
                <th className="px-4 py-3">Kickoff</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {currentWeekGames.map(game => {
                const locked = isLocked(game.kickoff_at)
                const favoredTeam = game.spread_favors === 'home' ? game.home_team : game.away_team
                const isEditing = editingId === game.id

                if (isEditing) {
                  return (
                    <EditGameRow
                      key={game.id}
                      game={game}
                      onCancel={() => setEditingId(null)}
                      onSave={(fd) => handleEditSave(game.id, fd)}
                      // Pass the point values of all OTHER games this week so the
                      // dropdown only shows values that aren't already taken.
                      // This game's own current value is excluded so it can keep it.
                      unavailablePointValues={currentWeekGames
                        .filter(g => g.id !== game.id)
                        .map(g => g.point_value)}
                    />
                  )
                }

                return (
                  <tr key={game.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-200">
                      {game.away_team} <span className="text-zinc-500">at</span> {game.home_team}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {favoredTeam} {game.spread}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{game.point_value}</td>
                    <td className="px-4 py-3 text-zinc-400">{formatKickoff(game.kickoff_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        game.status === 'final' ? 'bg-zinc-700 text-zinc-300' :
                        game.status === 'in_progress' ? 'bg-brand-900/50 text-brand-400' :
                        game.status === 'void' ? 'bg-red-900/50 text-red-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>
                        {game.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit only before 15-min lockout; Delete stays available after lock */}
                        {!locked && game.status !== 'void' && (
                          <button
                            onClick={() => setEditingId(game.id)}
                            className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                          >
                            Edit
                          </button>
                        )}
                        {game.status !== 'void' && (
                          <button
                            onClick={() => handleDelete(game.id, game.home_team, game.away_team)}
                            disabled={isPending}
                            className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                        {/* Void available at any time unless already void */}
                        {game.status !== 'void' && (
                          <button
                            onClick={() => handleVoid(game.id, game.home_team, game.away_team)}
                            disabled={isPending}
                            className="text-xs px-2 py-1 rounded bg-yellow-900/50 hover:bg-yellow-900 text-yellow-300 disabled:opacity-50"
                          >
                            Void
                          </button>
                        )}
                        {locked && game.status !== 'void' && (
                          <span className="text-xs text-zinc-600">Locked</span>
                        )}
                      </div>
                      {rowMsgs[game.id] && <Message {...rowMsgs[game.id]} />}
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
