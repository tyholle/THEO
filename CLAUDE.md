# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# THEO - Multi-Sport Pick'em App

## About This Project
THEO is a multi-sport pick'em web app where users pick ATS (against the spread) winners of games each week. Features include points/scoring, leaderboards, groups, group chat, and live scores. Supports multiple sports simultaneously (CFB, NFL, MLB, NBA, NHL).

## About The Developer
- Complete beginner with no technical background
- Always explain what you are doing and why in plain English before writing code
- Never write code without a plain English explanation a beginner can understand
- Explain every terminal command before asking me to run it
- When you create or modify a file, explain what that file does in simple terms
- Use comments inside code to explain what each section does
- Never assume I know what something means — define it
- Prefer simple solutions over clever ones
- Never skip steps
- If something could go wrong, warn me in advance

## Tech Stack
- **Frontend:** Next.js 14 App Router with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Chat:** Stream Chat SDK
- **Email:** Resend
- **AI:** Anthropic Claude API (email draft generation)
- **Hosting:** Vercel
- **Scores:** ESPN unofficial API

## Architecture
- App routes live in `src/app/(app)/` (route group with shared nav layout)
- Auth routes live in `src/app/auth/`
- API routes (cron jobs, etc.) live in `src/app/api/`
- Shared components go in `src/components/`
- Database helpers go in `src/lib/`
- Supabase client uses `@supabase/ssr` — never use legacy `@supabase/auth-helpers-nextjs`
- Admin server actions live in `src/app/(app)/admin/actions/` — always call `requireAdmin()` first
- `src/lib/supabase/admin.ts` — service role client (bypasses RLS); server-only, never import in client components
- `src/lib/espn.ts` — all ESPN API calls go through here; add new sports to `ESPN_SPORT_PATHS`
- `src/lib/scoring.ts` — ATS calculation and points logic; pure functions, no database calls
- `src/lib/refresh-scores.ts` — shared score refresh logic used by both the admin button and the cron job

## Key Features
- ATS picks on 10 games per week
- 1-10 point weighting per game (admin assigns)
- Double-down on any one game per week
- Global + group leaderboards per sport
- Leagues with join codes — create or join private leagues; commissioner can rename, remove members, transfer ownership, or delete the league
- Group chat with reactions
- Weekly preview email with AI draft + manual send
- Live scores via ESPN API (auto-refreshes every 5 minutes via cron)
- Multi-sport support — CFB, NFL, MLB, NBA, NHL all supported simultaneously

## Commands
- `npm run dev` — start local development server
- `npm run build` — production build
- `npm run lint` — check for code errors

## Important Rules
- Always use `@supabase/ssr` for Supabase client setup
- Never expose secret keys in code
- All database tables need Row Level Security (RLS) enabled
- Always provide a status report after completing any task
