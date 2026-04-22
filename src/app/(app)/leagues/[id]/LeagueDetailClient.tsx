'use client'
// src/app/(app)/leagues/[id]/LeagueDetailClient.tsx
//
// The interactive shell for the league detail page.
// Manages which tab (Leaderboard / Members) is currently active,
// and passes all server-fetched data down to the correct tab component.
//
// This is a thin wrapper — most of the logic lives in LeaderboardTab
// and MembersTab. Keeping this file small makes it easier to reason about.

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import LeaderboardTab from './LeaderboardTab'
import MembersTab from './MembersTab'

// Dynamic import — Stream Chat's JS (~421 kB) is only downloaded and executed
// when the user actually clicks the Chat tab. The league page loads fast by default.
// ssr: false is required because Stream Chat uses browser-only APIs (WebSockets).
const ChatTab = dynamic(() => import('./ChatTab'), {
  loading: () => (
    <div className="p-8 text-center text-zinc-500 text-sm animate-pulse">
      Loading chat...
    </div>
  ),
  ssr: false,
})
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
  league: {
    id:        string
    name:      string
    joinCode:  string
    sportName: string
  }
  currentUserId:      string
  currentUsername:    string
  isOwner:            boolean
  members:            LeagueMember[]
  weeks:              LeagueWeek[]
  selectedWeekNumber: number | null
  selectedWeekGames:  LeagueGame[]
  selectedWeekPicks:  LeaguePick[]
  overallStandings:   OverallStanding[]
  hasSeason:          boolean
}

type Tab = 'leaderboard' | 'members' | 'chat'

// -----------------------------------------------------------------------
// LeagueDetailClient
// -----------------------------------------------------------------------
export default function LeagueDetailClient({
  league,
  currentUserId,
  currentUsername,
  isOwner,
  members,
  weeks,
  selectedWeekNumber,
  selectedWeekGames,
  selectedWeekPicks,
  overallStandings,
  hasSeason,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard')

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">

      {/* Back navigation */}
      <div className="px-5 pt-12 pb-1">
        <Link
          href="/leagues"
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          ← Leagues
        </Link>
      </div>

      {/* League name + sport */}
      <div className="px-5 pt-2 pb-1">
        <h1 className="text-white text-2xl font-bold tracking-tight leading-tight">
          {league.name}
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">{league.sportName}</p>
      </div>

      {/* Join code — shown so members can share it */}
      <div className="px-5 pb-4">
        <p className="text-zinc-600 text-xs">
          Invite code:{' '}
          <span className="text-zinc-400 font-mono tracking-[0.2em] font-semibold">
            {league.joinCode}
          </span>
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex px-5 gap-0 border-b border-zinc-800 mb-0">
        {(['leaderboard', 'members', 'chat'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-5 py-2.5 text-sm font-semibold capitalize transition-colors
              border-b-2 -mb-px
              ${activeTab === tab
                ? 'text-white border-brand-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'}
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {activeTab === 'leaderboard' && (
          <LeaderboardTab
            leagueId={league.id}
            weeks={weeks}
            selectedWeekNumber={selectedWeekNumber}
            selectedWeekGames={selectedWeekGames}
            selectedWeekPicks={selectedWeekPicks}
            overallStandings={overallStandings}
            members={members}
            currentUserId={currentUserId}
            hasSeason={hasSeason}
          />
        )}

        {activeTab === 'members' && (
          <MembersTab
            leagueId={league.id}
            leagueName={league.name}
            members={members}
            currentUserId={currentUserId}
            isOwner={isOwner}
          />
        )}

        {activeTab === 'chat' && (
          <ChatTab
            leagueId={league.id}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
          />
        )}
      </div>
    </div>
  )
}
