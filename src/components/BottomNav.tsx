'use client'
// src/components/BottomNav.tsx
//
// The bottom navigation bar that appears on all user-facing pages.
// Fixed to the bottom of the screen on mobile. On desktop it stays
// centered and doesn't stretch across the full viewport.
//
// Tabs: Games (/picks), Leagues (/groups), Leaderboard (/leaderboard), Rules (/rules)
//
// 'use client' is required because this component reads the current URL
// (usePathname) to know which tab to highlight in purple.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// -----------------------------------------------------------------------
// SVG icon components
// Each icon is a simple 24×24 SVG. The `active` prop controls whether
// to show it in the brand purple or the default muted gray.
// -----------------------------------------------------------------------

function IconGames({ active }: { active: boolean }) {
  // Football/game icon — a simple grid of squares representing a game board
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-brand-400' : 'text-zinc-500'}>
      {/* TV / screen shape representing live games */}
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      {/* Play triangle inside */}
      <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconLeagues({ active }: { active: boolean }) {
  // Group/people icon — representing leagues and friend groups
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-brand-400' : 'text-zinc-500'}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
    </svg>
  )
}

function IconLeaderboard({ active }: { active: boolean }) {
  // Trophy icon — representing standings and rankings
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-brand-400' : 'text-zinc-500'}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 22v-4" />
      <path d="M14 22v-4" />
      <path d="M6 4v9a6 6 0 0 0 12 0V4" />
    </svg>
  )
}

function IconRules({ active }: { active: boolean }) {
  // Book/clipboard icon — representing rules and documentation
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-brand-400' : 'text-zinc-500'}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

// -----------------------------------------------------------------------
// Tab definitions
// Each tab has a label, the route it links to, and its icon component.
// -----------------------------------------------------------------------
const TABS = [
  { label: 'Games',        href: '/picks',        Icon: IconGames },
  { label: 'Leagues',      href: '/groups',       Icon: IconLeagues },
  { label: 'Leaderboard',  href: '/leaderboard',  Icon: IconLeaderboard },
  { label: 'Rules',        href: '/rules',        Icon: IconRules },
]

// -----------------------------------------------------------------------
// BottomNav
// The main component. Returns null (renders nothing) on the auth and
// admin pages so it doesn't interfere with those layouts.
// -----------------------------------------------------------------------
export default function BottomNav() {
  const pathname = usePathname()

  // Hide on the login/signup page and the admin panel entirely
  if (pathname.startsWith('/auth') || pathname.startsWith('/admin')) {
    return null
  }

  return (
    // Fixed to the bottom of the screen, above all other content (z-50).
    // bg-zinc-950/95 with backdrop-blur gives a frosted-glass effect.
    // border-t separates it visually from the page content above.
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">
      {/* Center-aligned, max width so it doesn't stretch wide on desktop */}
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {TABS.map(({ label, href, Icon }) => {
          // A tab is "active" if we're currently on that route.
          // The startsWith check handles sub-routes (e.g. /picks?week=3 is still the Games tab).
          const isActive = pathname === href || pathname.startsWith(href + '/')

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl
                          min-w-[56px] transition-colors duration-150
                          ${isActive ? 'text-brand-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Icon active={isActive} />
              {/* Label below the icon — tiny uppercase text */}
              <span className={`text-[9px] font-semibold tracking-widest uppercase
                                ${isActive ? 'text-brand-400' : 'text-zinc-600'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
