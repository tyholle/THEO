'use client'
// src/app/(app)/leagues/LeagueCard.tsx
//
// A single league card shown on the hub page.
// Clicking it navigates to the league's detail page.
// Shows: league name, sport, member count, user's overall rank.

import Link from 'next/link'
import type { LeagueHubItem } from './page'

export default function LeagueCard({ league }: { league: LeagueHubItem }) {
  return (
    <Link
      href={`/leagues/${league.id}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: name, sport, member count */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-lg leading-tight truncate">{league.name}</p>
          <p className="text-zinc-500 text-sm mt-0.5">{league.sportName}</p>
          <p className="text-zinc-600 text-xs mt-1">
            {league.memberCount} member{league.memberCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Right: user's rank in this league */}
        <div className="flex-shrink-0 text-right">
          {league.rank !== null ? (
            <>
              <p className="text-brand-400 text-2xl font-bold leading-tight">#{league.rank}</p>
              <p className="text-zinc-600 text-[10px] uppercase tracking-wider mt-0.5">Overall</p>
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-1">—</p>
          )}
        </div>
      </div>

      {/* Commissioner badge — shown only if the current user is the league owner */}
      {league.myRole === 'owner' && (
        <span className="mt-2 inline-block text-[10px] font-semibold tracking-wide uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
          Commissioner
        </span>
      )}
    </Link>
  )
}
