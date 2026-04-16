'use client'
// src/app/picks/WeekStrip.tsx
//
// The horizontal week selector at the top of the picks page.
// Shows all weeks in the season (e.g. Week 1, Week 2, … Week 15).
// The currently selected week is highlighted with a purple pill.
//
// 'use client' is required here because clicking a week button
// needs to update the URL using the router, which is a browser action.

import { useRouter } from 'next/navigation'
import type { WeekRow } from './page'

type Props = {
  weeks: WeekRow[]
  selectedWeekNumber: number
  sportSlug: string  // Current sport — preserved in the URL when switching weeks
}

export default function WeekStrip({ weeks, selectedWeekNumber, sportSlug }: Props) {
  const router = useRouter()

  // When the user taps a week, update the URL param while keeping ?sport=
  // so the page stays on the same sport (e.g. NFL Week 3 not CFB Week 3).
  function handleSelectWeek(weekNumber: number) {
    router.push(`/picks?sport=${sportSlug}&week=${weekNumber}`)
  }

  if (weeks.length === 0) return null

  return (
    // overflow-x-auto: allows horizontal scrolling if weeks don't all fit.
    // scrollbar-none: hides the scrollbar visually (CSS class in globals.css).
    // -mx-5 + px-5: "bleed" the scroll area to the edge of the screen while
    //   keeping the content padded inside.
    <div className="overflow-x-auto scrollbar-none -mx-5 px-5">
      <div className="flex gap-2 pb-1 w-max">
        {weeks.map((week) => {
          const isSelected = week.week_number === selectedWeekNumber
          return (
            <button
              key={week.id}
              onClick={() => handleSelectWeek(week.week_number)}
              className={`
                flex-none px-4 py-1.5 rounded-full text-xs font-semibold
                whitespace-nowrap transition-colors duration-150
                ${isSelected
                  ? 'bg-brand-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }
                ${week.is_complete
                  ? 'opacity-60'  // Slightly faded for completed weeks
                  : ''
                }
              `}
            >
              {week.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
