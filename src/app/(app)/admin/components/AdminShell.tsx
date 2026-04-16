'use client'
// src/app/admin/components/AdminShell.tsx
// This is the outer shell of the admin panel.
//
// It's a "client component" (note 'use client' at the top) because it needs
// to track which tab is currently selected — that's a piece of "state" (memory
// that lives in the browser and changes when you click things).
//
// The page.tsx server component fetches all data once and passes it down here.
// When the admin does something (adds a game, sends email, etc.), the server
// action calls revalidatePath('/admin'), which causes page.tsx to re-fetch
// fresh data and pass it back down through this component.

import { useState } from 'react'
import SeasonWeekTab from './SeasonWeekTab'
import GameTab from './GameTab'
import ScoresTab from './ScoresTab'
import EmailTab from './EmailTab'
import UsersTab from './UsersTab'

// These are the TypeScript types for all the data we receive from page.tsx.
// Each type describes the shape of one row from the database.
export type Sport   = { id: string; name: string; slug: string; is_active: boolean }
export type Season  = { id: string; sport_id: string; name: string; year: number; is_active: boolean; starts_at: string; ends_at: string }
export type Week    = { id: string; season_id: string; week_number: number; label: string; is_complete: boolean }
export type Game    = {
  id: string; week_id: string; home_team: string; away_team: string
  spread: number; spread_favors: 'home' | 'away'; point_value: number
  kickoff_at: string; espn_game_id: string | null
  home_score: number | null; away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final' | 'void'; ats_result: string | null
}
export type EmailLogEntry = { id: string; week_id: string; sent_by: string; sent_at: string; recipient_count: number; subject: string }
export type AdminUser = { id: string; email: string; username: string; is_admin: boolean; created_at: string }

// Props: all the data fetched by page.tsx, passed down here
type Props = {
  sports: Sport[]
  seasons: Season[]
  weeks: Week[]
  currentWeekGames: Game[]
  currentWeekId: string | null
  emailLog: EmailLogEntry[]
  adminUsers: AdminUser[]
  optedInCount: number
  currentUserId: string  // needed so UsersTab can disable the self-revoke button
}

// The 5 tabs, in order
const TABS = [
  { id: 'season', label: 'Season & Week' },
  { id: 'games',  label: 'Games' },
  { id: 'scores', label: 'Scores' },
  { id: 'email',  label: 'Email' },
  { id: 'users',  label: 'Users' },
] as const

type TabId = typeof TABS[number]['id']

export default function AdminShell(props: Props) {
  // activeTab tracks which section is currently visible
  const [activeTab, setActiveTab] = useState<TabId>('season')

  return (
    <div className="min-h-0">

      {/* ---- Tab navigation bar ---- */}
      <nav className="border-b border-zinc-800 px-6">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-400 text-brand-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ---- Tab content ---- */}
      <main className="px-6 py-8 max-w-5xl">
        {activeTab === 'season' && (
          <SeasonWeekTab
            sports={props.sports}
            seasons={props.seasons}
            weeks={props.weeks}
          />
        )}
        {activeTab === 'games' && (
          <GameTab
            sports={props.sports}
            seasons={props.seasons}
            weeks={props.weeks}
            currentWeekGames={props.currentWeekGames}
            currentWeekId={props.currentWeekId}
          />
        )}
        {activeTab === 'scores' && (
          <ScoresTab
            currentWeekGames={props.currentWeekGames}
          />
        )}
        {activeTab === 'email' && (
          <EmailTab
            weeks={props.weeks}
            emailLog={props.emailLog}
            optedInCount={props.optedInCount}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            users={props.adminUsers}
            currentUserId={props.currentUserId}
          />
        )}
      </main>
    </div>
  )
}
