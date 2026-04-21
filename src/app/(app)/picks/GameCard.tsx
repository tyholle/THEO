'use client'
// src/app/picks/GameCard.tsx
//
// A single game card on the picks page.
//
// Each card shows:
//   - Header: "AWAY @ HOME", kickoff time or live score, PTS badge
//   - Pick area (one of three states):
//       1. Not locked, no pick     → two equal team buttons
//       2. Not locked, pick made   → wide picked team + chip for other + double down bar
//       3. Locked, no pick         → two disabled buttons + "Matchup has locked" bar
//       4. Locked, pick made       → "Matchup has locked" bar + single full-width pick row
//
// This component is "pure" — it receives all data as props and calls
// callbacks (onPick, onRemovePick, onDoubleDown) when the user acts.
// All database writes happen in the parent PicksClient.

import type { GameRow, PickRow } from './page'

// -----------------------------------------------------------------------
// Helper: is this game locked?
// A game locks 15 minutes before kickoff. After that, no picks or changes.
// -----------------------------------------------------------------------
function isGameLocked(kickoffAt: string): boolean {
  const lockTime = new Date(kickoffAt).getTime() - 15 * 60 * 1000
  return Date.now() >= lockTime
}

// -----------------------------------------------------------------------
// Helper: format kickoff time for display.
// Converts the UTC timestamp to US Eastern time.
// e.g. "September 22, 4:00 PM"
// -----------------------------------------------------------------------
function formatKickoff(kickoffAt: string): string {
  return new Date(kickoffAt).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
}

// -----------------------------------------------------------------------
// Helper: build the spread label shown on each team button.
//
// Spread is stored as a negative number (e.g. -7).
// spread_favors tells us which team is the favorite.
//
// Favored team → shows the negative spread: "-7"
// Underdog team → shows the positive equivalent: "+7"
// -----------------------------------------------------------------------
function spreadLabel(
  team: 'home' | 'away',
  spread: number,
  spreadFavors: 'home' | 'away'
): string {
  if (spreadFavors === team) {
    // This team is favored — show their negative line
    return spread % 1 === 0 ? spread.toString() : spread.toFixed(1)
  }
  // This team is the underdog — show the mirrored positive line
  const abs = Math.abs(spread)
  return '+' + (abs % 1 === 0 ? abs.toString() : abs.toFixed(1))
}

// -----------------------------------------------------------------------
// Helper: determine the outcome of a pick for win/loss coloring.
// Returns null if the game hasn't been scored yet.
// -----------------------------------------------------------------------
function getPickOutcome(
  pick: PickRow,
  game: GameRow
): 'win' | 'loss' | 'push' | null {
  if (game.status !== 'final' || !game.ats_result) return null
  if (game.ats_result === 'push' || game.ats_result === 'void') return 'push'
  return pick.picked_team === game.ats_result ? 'win' : 'loss'
}

// -----------------------------------------------------------------------
// TeamLogo
// A small circular container for the team's logo image.
// The dark background makes ESPN's transparent logos visible on THEO's
// dark canvas. If no logo URL is available, shows the team's initials.
// -----------------------------------------------------------------------
function TeamLogo({
  logoUrl,
  shortName,
  size = 'md',
}: {
  logoUrl: string | null
  shortName: string
  size?: 'sm' | 'md'
}) {
  const containerClass = size === 'sm'
    ? 'w-7 h-7 rounded-full bg-zinc-700/80 flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5'
    : 'w-8 h-8 rounded-full bg-zinc-700/80 flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5'

  const textClass = size === 'sm' ? 'text-[9px] font-black text-zinc-200' : 'text-[10px] font-black text-zinc-200'

  const initials = shortName.slice(0, 3).toUpperCase()

  return (
    <div className={containerClass}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={shortName}
          className="w-full h-full object-contain"
          onError={(e) => {
            const el = e.currentTarget
            el.style.display = 'none'
            if (el.nextSibling) (el.nextSibling as HTMLElement).style.display = 'flex'
          }}
        />
      ) : null}
      <span
        className={textClass}
        style={{ display: logoUrl ? 'none' : 'flex' }}
      >
        {initials}
      </span>
    </div>
  )
}

// -----------------------------------------------------------------------
// GameStatusLine
// Shows the current state of the game in the card header.
//   - Scheduled: "September 22, 4:00 PM"
//   - Live: "LIVE  ·  14 – 7"
//   - Final: "FINAL  ·  28 – 21"
//   - Void: "VOID"
// -----------------------------------------------------------------------
function GameStatusLine({ game }: { game: GameRow }) {
  if (game.status === 'in_progress') {
    return (
      <p className="text-xs font-semibold text-emerald-400 mt-0.5 tracking-wide">
        LIVE&nbsp;&nbsp;·&nbsp;&nbsp;
        {game.away_score ?? 0} – {game.home_score ?? 0}
      </p>
    )
  }
  if (game.status === 'final') {
    return (
      <p className="text-xs font-semibold text-zinc-500 mt-0.5 tracking-wide uppercase">
        Final&nbsp;&nbsp;·&nbsp;&nbsp;
        {game.away_score ?? 0} – {game.home_score ?? 0}
      </p>
    )
  }
  if (game.status === 'void') {
    return (
      <p className="text-xs font-semibold text-zinc-600 mt-0.5 tracking-wide uppercase">Void</p>
    )
  }
  return (
    <p className="text-xs text-zinc-500 mt-0.5">{formatKickoff(game.kickoff_at)}</p>
  )
}

// -----------------------------------------------------------------------
// TeamButton
// One side of the pick row. Can be in three visual states:
//   1. Neither team picked → equal width, logo + name + spread
//   2. This team is picked → expanded wide, purple/green/red gradient
//   3. Other team is picked → shrunk to a small logo-only chip
// -----------------------------------------------------------------------
function TeamButton({
  team,
  shortName,
  logoUrl,
  spread,
  isPicked,
  isOtherPicked,
  outcome,
  locked,
  onClick,
}: {
  team: 'home' | 'away'
  shortName: string
  logoUrl: string | null
  spread: string
  isPicked: boolean
  isOtherPicked: boolean
  outcome: 'win' | 'loss' | 'push' | null
  locked: boolean
  onClick: () => void
}) {
  const sizeClass = isOtherPicked
    ? 'w-14 flex-none'
    : 'flex-1'

  let bgClass: string
  if (!isPicked) {
    bgClass = 'bg-zinc-800 hover:bg-zinc-700'
  } else if (outcome === 'win') {
    bgClass = 'bg-gradient-to-r from-zinc-900 via-emerald-900/60 to-emerald-700/50'
  } else if (outcome === 'loss') {
    bgClass = 'bg-gradient-to-r from-zinc-900 via-red-900/60 to-red-700/50'
  } else {
    bgClass = 'bg-gradient-to-r from-zinc-900 via-brand-900 to-brand-600'
  }

  return (
    <button
      type="button"
      data-team={team}
      onClick={onClick}
      disabled={locked}
      className={`
        flex items-center justify-center gap-2 rounded-xl py-4 px-3
        transition-all duration-200 overflow-hidden
        ${sizeClass}
        ${bgClass}
        ${locked ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}
      `}
    >
      <TeamLogo
        logoUrl={logoUrl}
        shortName={shortName}
        size={isOtherPicked ? 'sm' : 'md'}
      />
      {!isOtherPicked && (
        <div className="flex flex-col items-start min-w-0 overflow-hidden">
          <span className="text-white font-bold text-sm truncate leading-tight">
            {shortName}
          </span>
          <span className="text-zinc-400 text-xs font-medium leading-tight">
            {spread}
          </span>
        </div>
      )}
    </button>
  )
}

// -----------------------------------------------------------------------
// DoubleDownButton
// Full-width bar below the team buttons.
// Inactive: dark with muted text — invites the user to press it.
// Active: bright red with bold italic text — unmistakably "doubled down".
// -----------------------------------------------------------------------
function DoubleDownButton({
  isActive,
  onClick,
}: {
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full py-3 rounded-xl text-sm font-black tracking-wider uppercase
        transition-all duration-200 active:scale-[0.99]
        ${isActive
          ? 'bg-red-600 text-white italic shadow-lg shadow-red-900/40'
          : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300'
        }
      `}
    >
      {isActive ? 'DOUBLED DOWN!!' : 'DOUBLE DOWN'}
    </button>
  )
}

// -----------------------------------------------------------------------
// LockedPickRow
// Shown instead of the two team buttons when a game is locked and the
// user has made a pick. Displays a single full-width row with:
//   - Team logo
//   - Team name and spread
//   - Double-down icon (if the user doubled down on this game)
//
// The background color matches the pick outcome — purple while the game
// is live, green if the user won, red if they lost.
// -----------------------------------------------------------------------
function LockedPickRow({
  shortName,
  logoUrl,
  spread,
  outcome,
  isDoubleDown,
}: {
  shortName: string
  logoUrl: string | null
  spread: string
  outcome: 'win' | 'loss' | 'push' | null
  isDoubleDown: boolean
}) {
  // Same gradient logic as TeamButton — outcome determines the color
  let bgClass: string
  if (outcome === 'win') {
    bgClass = 'bg-gradient-to-r from-zinc-900 via-emerald-900/60 to-emerald-700/50'
  } else if (outcome === 'loss') {
    bgClass = 'bg-gradient-to-r from-zinc-900 via-red-900/60 to-red-700/50'
  } else {
    // Active pick (game not yet scored) — brand purple
    bgClass = 'bg-gradient-to-r from-zinc-900 via-brand-900 to-brand-600'
  }

  return (
    <div className={`mx-4 mb-3 flex items-center gap-3 rounded-xl py-4 px-4 ${bgClass}`}>
      {/* Team logo */}
      <TeamLogo logoUrl={logoUrl} shortName={shortName} size="md" />

      {/* Team name and spread — takes up remaining space */}
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-white font-bold text-sm leading-tight">{shortName}</span>
        <span className="text-zinc-400 text-xs font-medium leading-tight">{spread}</span>
      </div>

      {/* Double-down icon — only shown if the user doubled down on this game */}
      {isDoubleDown && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/graphics/doubledown.svg`}
          alt="Double down"
          className="w-5 h-5 flex-shrink-0 opacity-90"
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// GameCard — the main export
// -----------------------------------------------------------------------
type Props = {
  game: GameRow
  pick: PickRow | null            // The user's current pick, or null if none
  isPending: boolean              // True while a pick save is in-flight for this game
  onPick: (team: 'home' | 'away') => void
  onRemovePick: () => void
  onDoubleDown: () => void
}

export default function GameCard({ game, pick, isPending, onPick, onRemovePick, onDoubleDown }: Props) {
  const locked = isGameLocked(game.kickoff_at)
  const outcome = pick ? getPickOutcome(pick, game) : null

  // The short name shown on buttons — falls back to full team name if null
  const homeShort = game.home_short_name ?? game.home_team
  const awayShort = game.away_short_name ?? game.away_team

  // Spread labels: e.g. "Ohio State -7" / "Michigan +7"
  const homeSpread = spreadLabel('home', game.spread, game.spread_favors)
  const awaySpread = spreadLabel('away', game.spread, game.spread_favors)

  // Derive display values for the locked pick row
  const pickedShort    = pick?.picked_team === 'home' ? homeShort    : awayShort
  const pickedLogoUrl  = pick?.picked_team === 'home' ? game.home_logo_url : game.away_logo_url
  const pickedSpread   = pick?.picked_team === 'home' ? homeSpread   : awaySpread

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">

      {/* ---- Card header ---- */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">

        {/* Left: game title + status */}
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="text-white font-bold text-sm leading-snug">
            {awayShort} <span className="text-zinc-500 font-medium">@</span> {homeShort}
          </h3>
          <GameStatusLine game={game} />
        </div>

        {/* Right: PTS badge and Remove Pick */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-brand-400 font-black text-sm tabular-nums">
            {game.point_value} <span className="text-brand-600 font-semibold text-xs">PTS</span>
          </span>
          {/* Remove Pick — only before lock */}
          {pick && !locked && (
            <button
              onClick={onRemovePick}
              className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors"
            >
              × Remove
            </button>
          )}
        </div>
      </div>

      {/* ---- Pick area ----
          Four possible states:
            A) Locked + pick made   → lock bar + single picked-team row
            B) Locked + no pick     → two disabled buttons + lock bar
            C) Not locked + pick    → wide picked team + small other team chip + double down
            D) Not locked + no pick → two equal team buttons
      */}

      {locked && pick ? (
        // State A: Game is locked and user made a pick.
        // Show a clear "Matchup has locked" bar, then a single row
        // displaying which team they picked. The double-down icon
        // appears next to the team name if they doubled down.
        <>
          {/* Single full-width row showing the picked team */}
          <LockedPickRow
            shortName={pickedShort}
            logoUrl={pickedLogoUrl}
            spread={pickedSpread}
            outcome={outcome}
            isDoubleDown={pick.is_double_down}
          />

          {/* "Matchup has locked" bar — below the pick */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/40">
              <span className="text-xs text-zinc-500 font-medium tracking-wide">
                🔒 Matchup has locked
              </span>
            </div>
          </div>
        </>
      ) : (
        // States B, C, D: Game is not locked, OR locked but no pick was made.
        <>
          {/* Team buttons — disabled when locked or save is in-flight */}
          <div className="flex gap-2 px-4 pb-3">
            <TeamButton
              team="away"
              shortName={awayShort}
              logoUrl={game.away_logo_url}
              spread={awaySpread}
              isPicked={pick?.picked_team === 'away'}
              isOtherPicked={pick?.picked_team === 'home'}
              outcome={pick?.picked_team === 'away' ? outcome : null}
              locked={locked || isPending}
              onClick={() => onPick('away')}
            />
            <TeamButton
              team="home"
              shortName={homeShort}
              logoUrl={game.home_logo_url}
              spread={homeSpread}
              isPicked={pick?.picked_team === 'home'}
              isOtherPicked={pick?.picked_team === 'away'}
              outcome={pick?.picked_team === 'home' ? outcome : null}
              locked={locked || isPending}
              onClick={() => onPick('home')}
            />
          </div>

          {/* Double Down bar — only shown before lock when pick exists */}
          {pick && !locked && game.status === 'scheduled' && (
            <div className="px-4 pb-4">
              <DoubleDownButton
                isActive={pick.is_double_down}
                onClick={onDoubleDown}
              />
            </div>
          )}

          {/* Lock bar — shown when locked but no pick was made.
              Applies to all game statuses (scheduled, in_progress, final)
              so users always know the window has closed. */}
          {locked && (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-800/40 border border-zinc-700/30">
                <span className="text-xs text-zinc-600 font-medium tracking-wide">
                  🔒 Matchup has locked
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
