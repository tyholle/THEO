// src/app/admin/page.tsx
// The admin panel's main page.
//
// This is a Server Component — it runs on the server before anything
// is sent to the browser. It does three things:
//   1. Verifies the current user is an admin (second check after middleware)
//   2. Fetches all the data every tab needs
//   3. Passes everything to AdminShell, which handles tab switching in the browser
//
// When any server action calls revalidatePath('/admin'), Next.js re-runs
// this component to get fresh data, then passes it back to AdminShell.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminShell from './components/AdminShell'
import type { AdminUser } from './components/AdminShell'
import type { User } from '@supabase/supabase-js'

export default async function AdminPage() {
  const supabase      = createClient()
  const adminClient   = createAdminClient()

  // ---- 1. Auth check ----
  // Middleware already checked this, but we verify again here because
  // Server Components can be called directly and we never trust only
  // the client-side check.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: selfProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!selfProfile?.is_admin) redirect('/picks')

  // ---- 2. Fetch all data in parallel ----
  // Promise.all runs all these database queries at the same time instead
  // of one after another — much faster when you have many queries.
  const [
    { data: sports    },
    { data: seasons   },
    { data: weeks     },
    { data: emailLog  },
    { data: profiles  },
    { data: { users: authUsers } },
  ] = await Promise.all([
    supabase.from('sports').select('*').order('name'),
    supabase.from('seasons').select('*').order('year', { ascending: false }),
    supabase.from('weeks').select('*').order('week_number'),
    supabase.from('email_log').select('*').order('sent_at', { ascending: false }),
    supabase.from('profiles').select('*'),
    // Paginated fetch: loops until all pages are collected.
    // A single listUsers call caps at 1000 — this handles any size user base.
    (async () => {
      // User[] is from @supabase/supabase-js — explicit type prevents TypeScript
      // collapsing this to never[] (which would break .push and the return type)
      const allUsers: User[] = []
      let page = 1
      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000, page })
        // Handle API error separately from "no more pages" so errors don't
        // silently produce an incomplete list
        if (error) {
          console.error('Failed to fetch auth users page', page, error.message)
          break
        }
        if (!data.users.length) break
        allUsers.push(...data.users)
        if (data.users.length < 1000) break
        page++
      }
      return { data: { users: allUsers } }
    })(),
  ])

  // ---- Determine all non-complete weeks for ALL active seasons ----
  // When multiple sports are active (e.g. CFB + MLB), we want to show
  // games from every non-complete week across all sports.
  //
  // Previously this only picked the FIRST non-complete week per season,
  // which meant games in Week 2, 3, etc. would never appear in the admin
  // panel or get refreshed from ESPN — even if Week 1 was long finished.
  const activeSeasonsList = seasons?.filter(s => s.is_active) ?? []

  // Collect ALL non-complete week IDs across all active seasons
  const allNonCompleteWeeks = activeSeasonsList.flatMap(season =>
    (weeks ?? []).filter(w => w.season_id === season.id && !w.is_complete)
  )
  const currentWeekIds = allNonCompleteWeeks.map(w => w.id)

  // ---- Fetch games for all non-complete weeks ----
  const { data: currentWeekGames } = currentWeekIds.length > 0
    ? await supabase
        .from('games')
        .select('*')
        .in('week_id', currentWeekIds)
        .order('kickoff_at')
    : { data: [] }

  // For the "Add Game" week selector default, use the earliest non-complete week
  const currentWeek = allNonCompleteWeeks
    .sort((a, b) => a.week_number - b.week_number)[0] ?? null

  // ---- Build admin user list (join auth.users with profiles) ----
  // auth.users has the email; profiles has the username and is_admin
  const adminUsers: AdminUser[] = (authUsers ?? []).map(authUser => {
    const profile = profiles?.find(p => p.id === authUser.id)
    return {
      id:         authUser.id,
      email:      authUser.email ?? '',
      username:   profile?.username ?? '(no username)',
      is_admin:   profile?.is_admin ?? false,
      created_at: authUser.created_at,
    }
  })

  // ---- Count opted-in users ----
  const optedInCount = profiles?.filter(p => p.email_opt_in).length ?? 0

  // ---- 3. Render ----
  return (
    <AdminShell
      sports={sports ?? []}
      seasons={seasons ?? []}
      weeks={weeks ?? []}
      currentWeekGames={currentWeekGames ?? []}
      currentWeekId={currentWeek?.id ?? null}
      emailLog={emailLog ?? []}
      adminUsers={adminUsers}
      optedInCount={optedInCount}
      currentUserId={user.id}
    />
  )
}
