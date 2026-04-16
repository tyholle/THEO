'use client'
// src/app/admin/components/UsersTab.tsx
// UI for Section 5: User Management.
//
// Shows a table of all users with their username, email, join date, and admin status.
// Each row has a toggle button to grant or revoke admin access.
//
// Two guards:
//   1. Confirmation dialog before toggling
//   2. Your own row's button is disabled — you can't revoke your own access

import { useState, useTransition } from 'react'
import { toggleAdminStatus } from '../actions/users'
import type { AdminUser } from './AdminShell'

type Props = {
  users: AdminUser[]
  currentUserId: string
}

function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="text-xs text-red-400 mt-1">{error}</p>
  if (success) return <p className="text-xs text-brand-400 mt-1">{success}</p>
  return null
}

export default function UsersTab({ users, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [rowMsgs, setRowMsgs] = useState<Record<string, { error?: string; success?: string }>>({})

  function handleToggle(user: AdminUser) {
    const newValue = !user.is_admin
    const action = newValue ? 'make an admin' : 'remove admin access from'
    const confirmMsg = `Are you sure you want to ${action} ${user.username}?`

    if (!confirm(confirmMsg)) return

    startTransition(async () => {
      const result = await toggleAdminStatus(user.id, newValue)
      if ('error' in result && result.error) {
        setRowMsgs(prev => ({ ...prev, [user.id]: { error: result.error } }))
      } else {
        setRowMsgs(prev => ({ ...prev, [user.id]: { success: newValue ? 'Made admin.' : 'Admin removed.' } }))
      }
    })
  }

  // Sort: admins first, then by username
  const sortedUsers = [...users].sort((a, b) => {
    if (a.is_admin && !b.is_admin) return -1
    if (!a.is_admin && b.is_admin) return 1
    return a.username.localeCompare(b.username)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">User Management</h2>
        <span className="text-sm text-zinc-500">{users.length} total user(s)</span>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr className="text-left text-xs text-zinc-500">
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sortedUsers.map(user => {
              const isSelf = user.id === currentUserId
              return (
                <tr key={user.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3 text-zinc-200 font-medium">
                    {user.username}
                    {isSelf && (
                      <span className="ml-2 text-xs text-zinc-500">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {user.is_admin ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-900/50 text-brand-400">
                        Admin
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Disable the button for the current admin (can't revoke self) */}
                    <div title={isSelf && user.is_admin ? 'You cannot remove your own admin access' : undefined}>
                      <button
                        onClick={() => handleToggle(user)}
                        disabled={isPending || (isSelf && user.is_admin)}
                        className={`text-xs px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          user.is_admin
                            ? 'bg-red-900/50 hover:bg-red-900 text-red-300'
                            : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                        }`}
                      >
                        {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                      </button>
                    </div>
                    <Message {...rowMsgs[user.id]} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
