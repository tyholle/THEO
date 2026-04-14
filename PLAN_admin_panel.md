# Feature Implementation Plan — Admin Panel

**Overall Progress:** `100%`

---

## TLDR

We're building a full admin panel at `/admin` for THEO. It lives on a single page with five tabs. Only users with `is_admin = true` in the database can access it (the middleware already handles that check). The panel lets you manage sports, seasons, and weeks; add and edit games (with ESPN auto-fill); refresh live scores and auto-score picks; generate and send a weekly preview email using Claude AI; and manage user accounts. No design polish — just functional and clean.

---

## Critical Decisions

- **Single page, five tabs** — All five sections live at `/admin` as tabs rather than separate URLs. Simpler navigation, less routing code.
- **Server Actions for all mutations** — When you submit a form (add a game, send an email, etc.), the data is processed on the server directly. No separate API files needed. This is the modern Next.js 14 way.
- **ESPN abstraction in one file** — All calls to the ESPN API go through `src/lib/espn.ts` only. If ESPN ever changes their URLs, we fix it in one place.
- **Service role key for admin data** — Reading user emails and toggling admin status requires a special Supabase key (`SUPABASE_SERVICE_ROLE_KEY`) that bypasses row-level security. This key is only ever used on the server, never exposed to the browser.
- **Spread stored as-entered** — Admin types `-7.5` and picks Home or Away from a dropdown. Stored exactly that way: `spread = -7.5`, `spread_favors = 'home'`. No transformation.
- **ATS + points calculated automatically** — The moment a game's status becomes `final` (either from a score refresh or a manual override), the app immediately calculates who covered the spread and writes each user's earned points. No separate "finalize" button.
- **Claude Sonnet for email drafts** — Using `claude-sonnet-4-5` for the AI-written game commentary in weekly preview emails. Better writing quality than the cheaper Haiku model, which matters for a key user-facing feature.

---

## Tasks

- [x] 🟩 **Step 1: Install packages and set up environment variables**
  - [x] 🟩 Install `resend` and `@anthropic-ai/sdk` via npm
  - [x] 🟩 Add `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` to `.env.local`

- [x] 🟩 **Step 2: Create the ESPN abstraction file (`src/lib/espn.ts`)**
  - [x] 🟩 `fetchGameById(espnGameId)` — calls game summary endpoint, returns home team, away team, kickoff time
  - [x] 🟩 `fetchScoresByDate(date)` — calls scoreboard endpoint, returns all games with scores and status
  - [x] 🟩 TypeScript types for ESPN response shapes

- [x] 🟩 **Step 3: Create the admin Supabase client (`src/lib/supabase/admin.ts`)**
  - [x] 🟩 Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS — only imported in server-side code

- [x] 🟩 **Step 4: Season & Week server actions (`src/app/admin/actions/season.ts`)**
  - [x] 🟩 `createSport` — inserts into sports table
  - [x] 🟩 `createSeason` — inserts into seasons table
  - [x] 🟩 `activateSeason` — sets is_active=true on one season, false on all others for that sport
  - [x] 🟩 `createWeek` — inserts into weeks table
  - [x] 🟩 `markWeekComplete` — sets is_complete=true on a week

- [x] 🟩 **Step 5: Game management server actions (`src/app/admin/actions/game.ts`)**
  - [x] 🟩 `lookupEspnGame` — calls ESPN API, returns home team, away team, kickoff time for a given ID
  - [x] 🟩 `createGame` — inserts into games table
  - [x] 🟩 `updateGame` — updates a game (blocked if within 15 min of kickoff)
  - [x] 🟩 `deleteGame` — deletes a game (blocked if within 15 min of kickoff)
  - [x] 🟩 `voidGame` — sets game to void, writes points_earned=0 to all picks

- [x] 🟩 **Step 6: Score management server actions (`src/app/admin/actions/scores.ts`)**
  - [x] 🟩 ATS calculation helper (pure function, no DB calls)
  - [x] 🟩 Points calculation helper (pure function, no DB calls)
  - [x] 🟩 `refreshScores` — loops over dates in current week, fetches ESPN, updates DB, auto-scores final games
  - [x] 🟩 `manualScoreOverride` — admin enters scores directly; triggers ATS+points if status=final

- [x] 🟩 **Step 7: Email server actions (`src/app/admin/actions/email.ts`)**
  - [x] 🟩 `generateEmailDraft` — fetches games for selected week, calls Claude API, returns draft text
  - [x] 🟩 `sendWeeklyEmail` — sends to all opted-in users via Resend, writes to email_log

- [x] 🟩 **Step 8: User management server actions (`src/app/admin/actions/users.ts`)**
  - [x] 🟩 `toggleAdminStatus` — flips is_admin on a user; blocks self-revoke

- [x] 🟩 **Step 9: Admin UI components**
  - [x] 🟩 `AdminShell.tsx` — client component managing active tab state
  - [x] 🟩 `SeasonWeekTab.tsx` — forms for creating sports, seasons, weeks
  - [x] 🟩 `GameTab.tsx` — ESPN lookup, add/edit/delete/void games
  - [x] 🟩 `ScoresTab.tsx` — refresh button, manual override, scores table
  - [x] 🟩 `EmailTab.tsx` — week selector, AI draft, editable textarea, send button, email log
  - [x] 🟩 `UsersTab.tsx` — user list with admin toggle

- [x] 🟩 **Step 10: Wire up the admin page (`src/app/admin/page.tsx`)**
  - [x] 🟩 Server component: verify admin, fetch all initial data, render AdminShell
