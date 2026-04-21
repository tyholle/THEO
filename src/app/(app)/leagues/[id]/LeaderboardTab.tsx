'use client'
// src/app/(app)/leagues/[id]/LeaderboardTab.tsx
//
// The Leaderboard tab on the league detail page.
//
// Two inner views, toggled by pill buttons:
//
//   OVERALL — season-long standings: rank, username, accuracy %, total pts
//   WEEKLY  — this-week standings: per-game picks with team logos
//             Other members' picks are hidden (🔒) until that game kicks off.
//
// Week selection uses URL params (?week=N) so Next.js re-runs the server
// component and sends fresh data. Clicking a week pill calls router.push.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  LeagueMember,
  OverallStanding,
  LeagueGame,
  LeaguePick,
  LeagueWeek,
} from './page'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
type Props = {
  leagueId:           string
  weeks:              LeagueWeek[]
  selectedWeekNumber: number | null
  selectedWeekGames:  LeagueGame[]
  selectedWeekPicks:  LeaguePick[]
  overallStandings:   OverallStanding[]
  members:            LeagueMember[]
  currentUserId:      string
  hasSeason:          boolean
}

type View = 'overall' | 'weekly'

// -----------------------------------------------------------------------
// LeaderboardTab
// -----------------------------------------------------------------------
export default function LeaderboardTab({
  leagueId,
  weeks,
  selectedWeekNumber,
  selectedWeekGames,
  selectedWeekPicks,
  overallStandings,
  members,
  currentUserId,
  hasSeason,
}: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>('overall')

  // ---- No active season ----
  if (!hasSeason) {
    return (
      <div className="px-5 py-16 text-center">
        <div className="text-3xl mb-3">📅</div>
        <p className="text-white font-semibold">No Active Season</p>
        <p className="text-zinc-500 text-sm mt-1">
          There&apos;s no active season for this sport yet.
        </p>
      </div>
    )
  }

  // ---- Season exists but no weeks yet ----
  if (weeks.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <div className="text-3xl mb-3">📅</div>
        <p className="text-white font-semibold">No Weeks Scheduled</p>
        <p className="text-zinc-500 text-sm mt-1">Check back once the first week is set up.</p>
      </div>
    )
  }

  // Navigate to a different week — re-runs the server component via URL param
  function selectWeek(weekNumber: number) {
    router.push(`/leagues/${leagueId}?week=${weekNumber}`)
  }

  return (
    <div>

      {/* Overall / Weekly toggle pills */}
      <div className="flex px-5 gap-2 mb-4">
        {(['overall', 'weekly'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`
              px-4 py-1.5 rounded-full text-sm font-semibold transition-colors capitalize
              ${view === v
                ? 'bg-brand-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'}
            `}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Week selector pills — only shown in Weekly view */}
      {view === 'weekly' && (
        <div className="px-5 pb-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {weeks.map(week => (
            <button
              key={week.id}
              onClick={() => selectWeek(week.week_number)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                transition-colors whitespace-nowrap
                ${week.week_number === selectedWeekNumber
                  ? 'bg-brand-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'}
              `}
            >
              {week.label}
            </button>
          ))}
        </div>
      )}

      {/* View content */}
      {view === 'overall' ? (
        <OverallStandingsTable
          standings={overallStandings}
          currentUserId={currentUserId}
        />
      ) : (
        <WeeklyStandingsTable
          games={selectedWeekGames}
          picks={selectedWeekPicks}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// OverallStandingsTable
// Season-long cumulative rankings.
// Columns: rank  |  username  |  accuracy %  |  total points
// -----------------------------------------------------------------------
function OverallStandingsTable({
  standings,
  currentUserId,
}: {
  standings:     OverallStanding[]
  currentUserId: string
}) {
  if (standings.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-zinc-600 text-sm">No standings yet.</div>
    )
  }

  return (
    <div className="px-5">
      {/* Header row */}
      <div className="grid grid-cols-[2rem_1fr_4rem_4rem] gap-2 px-3 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">#</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Player</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 text-right">Acc%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 text-right">Pts</span>
      </div>

      {/* Data rows */}
      <div className="flex flex-col gap-1.5">
        {standings.map(s => {
          const isMe = s.userId === currentUserId
          return (
            <div
              key={s.userId}
              className={`
                grid grid-cols-[2rem_1fr_4rem_4rem] gap-2 items-center px-3 py-3 rounded-xl
                ${isMe
                  ? 'bg-brand-500/10 border border-brand-500/20'
                  : 'bg-zinc-900 border border-zinc-800'}
              `}
            >
              {/* Rank number — top 3 in brand color */}
              <span className={`text-sm font-bold ${s.rank <= 3 ? 'text-brand-400' : 'text-zinc-500'}`}>
                {s.rank}
              </span>

              {/* Username */}
              <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-zinc-200'}`}>
                {s.username}
                {isMe && <span className="ml-1 text-zinc-600 text-xs font-normal">(you)</span>}
              </span>

              {/* Accuracy % — dash if no finished games yet */}
              <span className="text-sm text-zinc-400 text-right">
                {s.finishedPicks > 0 ? `${s.accuracy}%` : '—'}
              </span>

              {/* Total points */}
              <span className={`text-sm font-semibold text-right ${isMe ? 'text-brand-400' : 'text-white'}`}>
                {s.totalPoints}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// WeeklyStandingsTable
// Shows this week's results for all members.
// Each member row expands to show per-game pick cells.
// Other members' picks are hidden (🔒) if the game hasn't kicked off yet.
// -----------------------------------------------------------------------
function WeeklyStandingsTable({
  games,
  picks,
  members,
  currentUserId,
}: {
  games:         LeagueGame[]
  picks:         LeaguePick[]
  members:       LeagueMember[]
  currentUserId: string
}) {
  // Server renders at request time; client-side `now` is used for
  // kickoff comparisons so it reflects the browser's current time.
  const now = new Date()

  if (games.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-zinc-600 text-sm">
        No games scheduled for this week.
      </div>
    )
  }

  // Build a nested lookup so we can find a pick by [userId][gameId] in O(1)
  const pickMap: Record<string, Record<string, LeaguePick>> = {}
  for (const pick of picks) {
    if (!pickMap[pick.user_id]) pickMap[pick.user_id] = {}
    pickMap[pick.user_id][pick.game_id] = pick
  }

  // Sum each member's earned points for the week (scored picks only)
  const weekTotals: Record<string, number> = {}
  for (const member of members) {
    const memberPicks = Object.values(pickMap[member.userId] ?? {})
    weekTotals[member.userId] = memberPicks
      .filter(p => p.points_earned !== null)
      .reduce((sum, p) => sum + (p.points_earned ?? 0), 0)
  }

  // Sort members by this week's points (desc)
  const sorted = [...members].sort(
    (a, b) => (weekTotals[b.userId] ?? 0) - (weekTotals[a.userId] ?? 0)
  )

  // Assign weekly rank (ties share the same rank number)
  let currentRank = 1
  const weekRanks: Record<string, number> = {}
  sorted.forEach((m, i) => {
    if (i > 0 && (weekTotals[m.userId] ?? 0) < (weekTotals[sorted[i - 1].userId] ?? 0)) {
      currentRank = i + 1
    }
    weekRanks[m.userId] = currentRank
  })

  return (
    <div className="px-5 flex flex-col gap-3">
      {sorted.map(member => {
        const isMe       = member.userId === currentUserId
        const weekPoints = weekTotals[member.userId] ?? 0
        const rank       = weekRanks[member.userId]

        return (
          <div
            key={member.userId}
            className={`
              rounded-2xl border overflow-hidden
              ${isMe ? 'border-brand-500/30' : 'border-zinc-800'}
            `}
          >
            {/* Member summary row */}
            <div className={`flex items-center justify-between px-4 py-3 ${isMe ? 'bg-brand-500/10' : 'bg-zinc-900'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-bold w-6 flex-shrink-0 ${rank <= 3 ? 'text-brand-400' : 'text-zinc-500'}`}>
                  {rank}
                </span>
                <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-zinc-200'}`}>
                  {member.username}
                  {isMe && <span className="ml-1 text-zinc-600 text-xs font-normal">(you)</span>}
                </span>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${isMe ? 'text-brand-400' : 'text-white'}`}>
                {weekPoints} pts
              </span>
            </div>

            {/* Per-game pick cells */}
            <div className="bg-zinc-950 px-4 py-3 flex flex-wrap gap-2">
              {games.map(game => {
                const gameKickedOff = new Date(game.kickoff_at) <= now
                const pick          = pickMap[member.userId]?.[game.id] ?? null

                // For other members before kickoff: always show a lock.
                // We can't tell "hasn't picked" from "pick is hidden by RLS",
                // so we use a single locked state for all pre-kickoff other picks.
                const showLock = !isMe && !gameKickedOff

                return (
                  <PickCell
                    key={game.id}
                    game={game}
                    pick={pick}
                    showLock={showLock}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------------
// PickCell
// A small tile (32×32px) representing one pick in the weekly view.
//
// States:
//   🔒  — pre-kickoff, other member (pick hidden by RLS)
//   —   — no pick found (post-kickoff, or own pre-kickoff with no pick)
//   logo — team logo with a colored border based on result:
//           green  = correct pick
//           red    = wrong pick
//           gray   = game in progress / void / push
// -----------------------------------------------------------------------
type PickCellProps = {
  game:     LeagueGame
  pick:     LeaguePick | null
  showLock: boolean
}

function PickCell({ game, pick, showLock }: PickCellProps) {

  // Pre-kickoff + other member → always show lock
  if (showLock) {
    return (
      <div
        title="Pick hidden until kickoff"
        className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0"
      >
        <span className="text-xs">🔒</span>
      </div>
    )
  }

  // No pick available (post-kickoff or own slot with nothing picked)
  if (!pick) {
    return (
      <div className="w-8 h-8 rounded-lg bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center flex-shrink-0">
        <span className="text-zinc-600 text-xs font-bold">—</span>
      </div>
    )
  }

  // Determine which team was picked and its logo/name
  const pickedHome = pick.picked_team === 'home'
  const logoUrl    = pickedHome ? game.home_logo_url   : game.away_logo_url
  const shortName  = pickedHome
    ? (game.home_short_name ?? game.home_team)
    : (game.away_short_name ?? game.away_team)

  // Color-code the cell border based on game result
  let borderCls = 'border-zinc-700'
  let bgCls     = 'bg-zinc-800'

  if (game.ats_result !== null) {
    // Game is finished — check if pick was correct
    if ((pick.points_earned ?? 0) > 0) {
      // Correct pick → green
      borderCls = 'border-green-500/60'
      bgCls     = 'bg-green-900/30'
    } else if (game.ats_result === 'push' || game.ats_result === 'void') {
      // Push or void — neutral
      borderCls = 'border-zinc-600'
      bgCls     = 'bg-zinc-800/60'
    } else {
      // Wrong pick → red
      borderCls = 'border-red-500/60'
      bgCls     = 'bg-red-900/20'
    }
  }

  return (
    <div
      title={shortName}
      className={`
        w-8 h-8 rounded-lg border ${borderCls} ${bgCls}
        flex items-center justify-center overflow-hidden
        relative flex-shrink-0
      `}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={shortName}
          className="w-6 h-6 object-contain"
        />
      ) : (
        // Fallback: 3-letter abbreviation
        <span className="text-[8px] font-bold text-zinc-300 text-center leading-none px-0.5">
          {shortName.slice(0, 3).toUpperCase()}
        </span>
      )}

      {/* Double-down indicator — tiny "2" badge in the corner */}
      {pick.is_double_down && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-500 border border-zinc-950 flex items-center justify-center text-[6px] font-bold text-white">
          2
        </span>
      )}
    </div>
  )
}
