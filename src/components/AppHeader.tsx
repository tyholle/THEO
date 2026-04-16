'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '@/components/Logo'
import LogoutButton from '@/components/LogoutButton'

/** Top bar for all signed-in routes: logo (+ admin label on /admin), actions on the right. */
export default function AppHeader() {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <Logo />
        {isAdmin && (
          <span className="text-xs text-zinc-500 border-l border-zinc-700 pl-3 shrink-0">
            Admin Panel
          </span>
        )}
      </div>
      {isAdmin ? (
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to Dashboard
        </Link>
      ) : (
        <LogoutButton />
      )}
    </header>
  )
}
