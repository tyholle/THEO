'use client'
// src/app/admin/components/EmailTab.tsx
// UI for Section 4: Email Management.
//
// Workflow:
//   1. Admin selects a week from the dropdown
//   2. Clicks "Generate Draft" — Claude AI writes commentary for each game
//   3. Admin edits the subject line and body as needed
//   4. Clicks "Send Email" — Resend delivers to all opted-in users
//
// Also shows the email log (past sends) and a duplicate warning if this
// week's email has already been sent.

import { useState, useTransition } from 'react'
import { generateEmailDraft, sendWeeklyEmail } from '../actions/email'
import type { Week, EmailLogEntry } from './AdminShell'

type Props = {
  weeks: Week[]
  emailLog: EmailLogEntry[]
  optedInCount: number
}

function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
  if (success) return <p className="text-sm text-brand-400 bg-brand-900/30 border border-brand-800 rounded-lg px-3 py-2">{success}</p>
  return null
}

export default function EmailTab({ weeks, emailLog, optedInCount }: Props) {
  const [isPending, startTransition] = useTransition()

  const [selectedWeekId, setSelectedWeekId] = useState('')
  const [subject, setSubject]               = useState('')
  const [body, setBody]                     = useState('')

  const [draftMsg, setDraftMsg]  = useState<{ error?: string; success?: string }>({})
  const [sendMsg, setSendMsg]    = useState<{ error?: string; success?: string }>({})

  // Check if this week's email has already been sent (duplicate warning)
  const alreadySent = selectedWeekId
    ? emailLog.some(entry => entry.week_id === selectedWeekId)
    : false

  // ---- Generate draft ----
  function handleGenerateDraft() {
    if (!selectedWeekId) return
    setDraftMsg({})
    startTransition(async () => {
      const result = await generateEmailDraft(selectedWeekId)
      if ('error' in result && result.error) {
        setDraftMsg({ error: result.error })
      } else if ('success' in result) {
        setBody(result.draft ?? '')
        setSubject(result.defaultSubject ?? '')
        setDraftMsg({ success: 'Draft generated! Review and edit before sending.' })
      }
    })
  }

  // ---- Send email ----
  function handleSend() {
    if (!selectedWeekId || !subject.trim() || !body.trim()) return
    if (!confirm(`Send this email to ${optedInCount} opted-in user(s)? This cannot be undone.`)) return
    setSendMsg({})
    startTransition(async () => {
      const fd = new FormData()
      fd.set('week_id', selectedWeekId)
      fd.set('subject', subject)
      fd.set('body', body)
      const result = await sendWeeklyEmail(fd)
      if ('error' in result && result.error) {
        setSendMsg({ error: result.error })
      } else if ('success' in result) {
        setSendMsg({ success: `Email sent to ${(result as { success: boolean; recipientCount: number }).recipientCount} recipient(s)!` })
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Email Management</h2>

      {/* ---- Opted-in user count ---- */}
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 flex items-center gap-3">
        <div className="text-2xl font-bold text-brand-400">{optedInCount}</div>
        <div>
          <p className="text-sm text-zinc-200 font-medium">Users opted in to emails</p>
          <p className="text-xs text-zinc-500">This is how many recipients will receive the email.</p>
        </div>
      </div>

      {/* ---- Draft & Send ---- */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">Generate &amp; Send Weekly Email</h3>

        {/* Week selector */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Select Week</label>
          <select
            value={selectedWeekId}
            onChange={e => { setSelectedWeekId(e.target.value); setDraftMsg({}); setSendMsg({}) }}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                       text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— Select a week —</option>
            {weeks.map(w => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* Duplicate warning — non-blocking */}
        {alreadySent && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-sm text-yellow-300">
            ⚠️ An email has already been sent for this week. You can still send another, but check
            the email log below first to avoid duplicates.
          </div>
        )}

        {/* Generate draft button */}
        <button
          onClick={handleGenerateDraft}
          disabled={isPending || !selectedWeekId}
          className="px-4 py-2 rounded-lg bg-zinc-700 text-zinc-100 text-sm font-medium
                     hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Generating…' : 'Generate AI Draft'}
        </button>
        <Message {...draftMsg} />

        {/* Editable subject line */}
        {body && (
          <>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Subject Line</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Editable body */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Email Body (edit before sending)
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={20}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                           text-sm text-zinc-100 font-mono leading-relaxed
                           focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={isPending || !subject.trim() || !body.trim()}
              className="px-5 py-2.5 rounded-lg bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Sending…' : `Send to ${optedInCount} recipient(s)`}
            </button>
            <Message {...sendMsg} />
          </>
        )}
      </div>

      {/* ---- Email log ---- */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300">Past Sends</h3>
        </div>

        {emailLog.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500 text-center">No emails sent yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {emailLog.map(entry => (
                <tr key={entry.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3 text-zinc-200">{entry.subject}</td>
                  <td className="px-4 py-3 text-zinc-400">{entry.recipient_count}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(entry.sent_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
