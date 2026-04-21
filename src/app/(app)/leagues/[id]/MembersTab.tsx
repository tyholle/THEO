'use client'
// src/app/(app)/leagues/[id]/MembersTab.tsx
//
// The Members tab on the league detail page.
// Shows the full member list with join dates and roles.
//
// Commissioner-only features:
//   • Edit the league name (inline text field)
//   • Remove a member (with a confirm step)
//   • Transfer commissioner role (with a confirm step)
//
// All members see a "Leave League" button at the bottom.
// The commissioner sees a message instead: "Transfer role first."

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  removeMember,
  leaveLeague,
  transferCommissioner,
  editLeagueName,
  deleteLeague,
} from '../actions'
import type { LeagueMember } from './page'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
type Props = {
  leagueId:      string
  leagueName:    string
  members:       LeagueMember[]
  currentUserId: string
  isOwner:       boolean
}

// -----------------------------------------------------------------------
// MembersTab
// -----------------------------------------------------------------------
export default function MembersTab({ leagueId, leagueName, members, currentUserId, isOwner }: Props) {
  const router = useRouter()

  // useTransition keeps the UI responsive while a server action is running.
  // isPending = true while we're waiting for the server.
  const [isPending, startTransition] = useTransition()

  // Shared error banner state
  const [error, setError] = useState<string | null>(null)

  // Edit league name
  const [editingName,  setEditingName]  = useState(false)
  const [newName,      setNewName]      = useState('')

  // Confirm dialogs — store the user ID we're about to act on
  const [removeTarget,   setRemoveTarget]   = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<string | null>(null)

  // Leave confirmation
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  // Delete league confirmation (commissioner only)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ---- Helper: run a server action and handle the response ----
  function runAction(action: () => Promise<{ success?: true; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  // ---- Leave league ----
  function handleLeave() {
    setError(null)
    startTransition(async () => {
      const result = await leaveLeague(leagueId)
      if (result.error) {
        setError(result.error)
        setShowLeaveConfirm(false)
      } else {
        // After leaving, send the user back to the hub
        router.replace('/leagues')
      }
    })
  }

  return (
    <div className="px-5">

      {/* Commissioner: edit league name */}
      {isOwner && (
        <div className="mb-5">
          {editingName ? (
            // Inline edit form
            <form
              onSubmit={e => {
                e.preventDefault()
                runAction(async () => {
                  const result = await editLeagueName(leagueId, newName)
                  if (result.success) setEditingName(false)
                  return result
                })
              }}
              className="flex gap-2"
            >
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={50}
                placeholder="New league name"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={isPending || !newName.trim()}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => { setNewName(leagueName); setEditingName(true) }}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              ✏️ Edit league name
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Member list */}
      <div className="flex flex-col gap-2">
        {members.map(member => {
          const isMe           = member.userId === currentUserId
          const isCommissioner = member.role === 'owner'
          const isConfirmingRemove   = removeTarget   === member.userId
          const isConfirmingTransfer = transferTarget === member.userId

          return (
            <div
              key={member.userId}
              className={`
                bg-zinc-900 border rounded-xl px-4 py-3
                ${isMe ? 'border-brand-800/60' : 'border-zinc-800'}
              `}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Member info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white font-medium text-sm">{member.username}</span>
                    {isMe && (
                      <span className="text-zinc-600 text-xs">(you)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {/* Role badge */}
                    <span className={`text-xs font-semibold ${isCommissioner ? 'text-amber-400' : 'text-zinc-500'}`}>
                      {isCommissioner ? 'Commissioner' : 'Member'}
                    </span>
                    {/* Join date */}
                    <span className="text-zinc-700 text-xs">
                      · Joined{' '}
                      {new Date(member.joinedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day:   'numeric',
                        year:  'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Commissioner actions — only shown on OTHER members, not self */}
                {isOwner && !isMe && (
                  <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">

                    {/* Confirm transfer dialog */}
                    {isConfirmingTransfer ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-400">Make commissioner?</span>
                        <button
                          onClick={() => runAction(() => transferCommissioner(leagueId, member.userId))}
                          disabled={isPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setTransferTarget(null)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-700 text-zinc-300 font-semibold"
                        >
                          No
                        </button>
                      </div>
                    ) : isConfirmingRemove ? (
                      /* Confirm remove dialog */
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-400">Remove?</span>
                        <button
                          onClick={() => { runAction(() => removeMember(leagueId, member.userId)); setRemoveTarget(null) }}
                          disabled={isPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setRemoveTarget(null)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-700 text-zinc-300 font-semibold"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      /* Default: show action buttons */
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setTransferTarget(member.userId); setRemoveTarget(null) }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-amber-400 font-semibold hover:bg-zinc-700 transition-colors"
                        >
                          Transfer
                        </button>
                        <button
                          onClick={() => { setRemoveTarget(member.userId); setTransferTarget(null) }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-red-400 font-semibold hover:bg-zinc-700 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- Delete League (commissioner only) ---- */}
      {isOwner && (
        <div className="mt-6 mb-2">
          {showDeleteConfirm ? (
            <div className="bg-zinc-900 border border-red-900/50 rounded-xl p-4">
              <p className="text-white text-sm font-medium mb-1">
                Delete this league?
              </p>
              <p className="text-zinc-500 text-xs mb-3">
                This closes the league for all members. Pick history is kept
                but the league will no longer appear for anyone. This cannot
                be undone without contacting an admin.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteLeague(leagueId)
                      if (result.error) {
                        setError(result.error)
                        setShowDeleteConfirm(false)
                      } else {
                        router.replace('/leagues')
                      }
                    })
                  }}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isPending ? 'Deleting…' : 'Delete League'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-red-500 hover:text-red-400 transition-colors"
            >
              Delete League
            </button>
          )}
        </div>
      )}

      {/* ---- Leave League ---- */}
      <div className="mt-4 mb-2">
        {showLeaveConfirm ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {isOwner ? (
              // Commissioner cannot leave — must transfer first
              <>
                <p className="text-white text-sm font-medium mb-1">
                  Transfer the commissioner role first.
                </p>
                <p className="text-zinc-500 text-xs mb-3">
                  Use the &quot;Transfer&quot; button next to another member, then come back here to leave.
                </p>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
                >
                  Got it
                </button>
              </>
            ) : (
              // Regular member confirm dialog
              <>
                <p className="text-white text-sm font-medium mb-3">
                  Leave this league? You can re-join later with the same code.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLeave}
                    disabled={isPending}
                    className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {isPending ? 'Leaving…' : 'Leave League'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Leave League
          </button>
        )}
      </div>
    </div>
  )
}
