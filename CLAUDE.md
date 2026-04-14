# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# THEO - College Football Pick'em App

## About This Project
THEO is a college football pick'em web app where users pick ATS (against the spread) winners of 10 games per week. Features include points/scoring, leaderboards, groups, group chat, and live scores.

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
- All routes live in `src/app/`
- Shared components go in `src/components/`
- Database helpers go in `src/lib/`
- Supabase client uses `@supabase/ssr` — never use legacy `@supabase/auth-helpers-nextjs`
- Admin server actions live in `src/app/admin/actions/` — always call `requireAdmin()` first
- `src/lib/supabase/admin.ts` — service role client (bypasses RLS); server-only, never import in client components
- `src/lib/espn.ts` — all ESPN API calls go through here
- `src/lib/scoring.ts` — ATS calculation and points logic; pure functions, no database calls

## Key Features
- ATS picks on 10 games per week
- 1-10 point weighting per game (admin assigns)
- Double-down on any one game per week
- Global + group leaderboards per sport
- Groups with join codes (like Clash Royale clans)
- Group chat with reactions
- Weekly preview email with AI draft + manual send
- Live scores via ESPN API
- Multi-sport support (CFB first, others later)

## Commands
- `npm run dev` — start local development server
- `npm run build` — production build
- `npm run lint` — check for code errors

## Important Rules
- Always use `@supabase/ssr` for Supabase client setup
- Never expose secret keys in code
- All database tables need Row Level Security (RLS) enabled
- Always provide a status report after completing any task
