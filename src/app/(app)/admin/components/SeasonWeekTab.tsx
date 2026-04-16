'use client'
// src/app/admin/components/SeasonWeekTab.tsx
// UI for Section 1: Season & Week Management.
//
// Contains five forms:
//   1. Create a new sport
//   2. Create a new season
//   3. Activate a season (with a button per season row)
//   4. Create a new week
//   5. Mark a week as complete (with a button per week row)

import { useState, useTransition } from 'react'
import { createSport, createSeason, activateSeason, createWeek, markWeekComplete, deleteSeason, deleteWeek } from '../actions/season'
import type { Sport, Season, Week } from './AdminShell'

// useTransition is a React hook that lets us show a "loading" state while
// a server action is running, without blocking the rest of the UI.

type Props = {
  sports: Sport[]
  seasons: Season[]
  weeks: Week[]
}

// -----------------------------------------------------------------------
// Small reusable components for form layout
// -----------------------------------------------------------------------

// A labelled text input field
function Field({ label, name, type = 'text', placeholder, required = true }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                   text-sm text-zinc-100 placeholder-zinc-500
                   focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  )
}

// A section card with a title
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">{title}</h3>
      {children}
    </div>
  )
}

// A submit button that shows "Working…" while the action is pending
function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-[#5c5bf0] text-white font-medium text-sm
                 hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Working…' : label}
    </button>
  )
}

// An error or success message banner
function Message({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return (
    <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-3">
      {error}
    </p>
  )
  if (success) return (
    <p className="text-sm text-brand-400 bg-brand-900/30 border border-brand-800 rounded-lg px-3 py-2 mt-3">
      {success}
    </p>
  )
  return null
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------
export default function SeasonWeekTab({ sports, seasons, weeks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [messages, setMessages] = useState<Record<string, { error?: string; success?: string }>>({})

  // Helper: run a server action and capture its result for display
  function run(key: string, action: () => Promise<{ error?: string } | { success: true }>) {
    setMessages(prev => ({ ...prev, [key]: {} }))
    startTransition(async () => {
      const result = await action()
      if ('error' in result && result.error) {
        setMessages(prev => ({ ...prev, [key]: { error: result.error } }))
      } else {
        setMessages(prev => ({ ...prev, [key]: { success: 'Done!' } }))
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Season &amp; Week Management</h2>

      {/* ---- Create Sport ---- */}
      <Card title="Create Sport">
        <form
          action={(fd) => run('sport', () => createSport(fd))}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name" placeholder="College Football" />
            <Field label="Slug (short code)" name="slug" placeholder="cfb" />
          </div>
          <div className="flex items-center gap-2">
            <input type="hidden" name="is_active" value="true" />
            <SubmitButton label="Create Sport" pending={isPending} />
          </div>
          <Message {...messages['sport']} />
        </form>

        {/* List of existing sports */}
        {sports.length > 0 && (
          <div className="mt-4 space-y-1">
            {sports.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm text-zinc-400">
                <span className={`w-2 h-2 rounded-full ${s.is_active ? 'bg-brand-400' : 'bg-zinc-600'}`} />
                {s.name} <span className="text-zinc-600">({s.slug})</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- Create Season ---- */}
      <Card title="Create Season">
        <form
          action={(fd) => run('season', () => createSeason(fd))}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Sport</label>
            <select
              name="sport_id"
              required
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                         text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Select a sport —</option>
              {sports.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Season Name" name="name" placeholder="2025 CFB Season" />
            <Field label="Year" name="year" type="number" placeholder="2025" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" name="starts_at" type="date" />
            <Field label="End Date" name="ends_at" type="date" />
          </div>
          <SubmitButton label="Create Season" pending={isPending} />
          <Message {...messages['season']} />
        </form>

        {/* List of seasons with Activate and Delete buttons */}
        {seasons.length > 0 && (
          <div className="mt-4 space-y-2">
            {seasons.map(s => {
              const sport = sports.find(sp => sp.id === s.sport_id)
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.is_active ? 'bg-brand-400' : 'bg-zinc-600'}`} />
                      {s.name} <span className="text-zinc-500">({sport?.slug ?? '?'})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {!s.is_active && (
                        <button
                          onClick={() => run(`activate-${s.id}`, () => activateSeason(s.id))}
                          disabled={isPending}
                          className="text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      {s.is_active && (
                        <span className="text-xs text-brand-400 font-medium">Active</span>
                      )}
                      <button
                        onClick={() => {
                          if (!confirm(`Delete season "${s.name}"? This cannot be undone. (Will fail if weeks still exist.)`)) return
                          run(`delete-season-${s.id}`, () => deleteSeason(s.id))
                        }}
                        disabled={isPending}
                        className="text-xs px-3 py-1 rounded bg-red-900/40 hover:bg-red-900 text-red-400 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <Message {...(messages[`delete-season-${s.id}`] ?? {})} />
                </div>
              )
            })}
            {Object.entries(messages).filter(([k]) => k.startsWith('activate-')).map(([k, v]) => (
              <Message key={k} {...v} />
            ))}
          </div>
        )}
      </Card>

      {/* ---- Create Week ---- */}
      <Card title="Create Week">
        <form
          action={(fd) => run('week', () => createWeek(fd))}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Season</label>
            <select
              name="season_id"
              required
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2
                         text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Select a season —</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Week Number" name="week_number" type="number" placeholder="1" />
            <Field label="Label" name="label" placeholder="Week 1" />
          </div>
          <SubmitButton label="Create Week" pending={isPending} />
          <Message {...messages['week']} />
        </form>

        {/* List of weeks with Mark Complete and Delete buttons */}
        {weeks.length > 0 && (
          <div className="mt-4 space-y-2">
            {[...weeks].sort((a, b) => a.week_number - b.week_number).map(w => {
              // Look up the season and sport for this week so we can show
              // which sport it belongs to — important when CFB and NFL both exist
              const season = seasons.find(s => s.id === w.season_id)
              const sport  = season ? sports.find(sp => sp.id === season.sport_id) : null
              const sportTag = sport ? `${sport.slug.toUpperCase()} · ` : ''
              return (
              <div key={w.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${w.is_complete ? 'bg-zinc-600' : 'bg-brand-400'}`} />
                    <span className="text-zinc-500">{sportTag}</span>{w.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {!w.is_complete ? (
                      <button
                        onClick={() => run(`complete-${w.id}`, () => markWeekComplete(w.id))}
                        disabled={isPending}
                        className="text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50"
                      >
                        Mark Complete
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">Complete</span>
                    )}
                    <button
                      onClick={() => {
                        if (!confirm(`Delete "${w.label}"? This cannot be undone. (Will fail if games still exist.)`)) return
                        run(`delete-week-${w.id}`, () => deleteWeek(w.id))
                      }}
                      disabled={isPending}
                      className="text-xs px-3 py-1 rounded bg-red-900/40 hover:bg-red-900 text-red-400 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <Message {...(messages[`delete-week-${w.id}`] ?? {})} />
              </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
