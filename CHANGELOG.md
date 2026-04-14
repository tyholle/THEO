# Changelog

All notable changes to THEO are recorded here in plain English.

---

## [Unreleased]

## [0.3.0] — 2026-04-14

### Added
- **Admin panel** — A full management dashboard at `/admin`, accessible only to users with admin access. Organized into five tabs.
- **Season & Week tab** — Create sports (e.g. College Football), create seasons, mark a season as the active one, create weeks, mark weeks as complete, and delete seasons or weeks (blocked if they have data attached to them).
- **Games tab** — Add games to the current week. Includes ESPN auto-fill: type an ESPN game ID and the app looks up the teams and kickoff time automatically. Admins also set the point spread, which team is favored, and how many points the game is worth. Games can be edited, deleted, or voided (voiding zeroes out all picks for that game). Editing and deleting are blocked within 15 minutes of kickoff.
- **Scores tab** — Refresh live scores from ESPN with one click. The app fetches all games in the current week, updates scores and statuses, and automatically calculates who covered the spread and awards points to picks the moment a game goes final. Admins can also enter scores manually as an override.
- **Email tab** — Generate a weekly preview email draft using Claude AI (writes game-by-game commentary automatically), edit the draft, write a subject line, and send it to all opted-in users via Resend. Sent emails are logged in a history table.
- **Users tab** — View all registered users (email, username, join date) and toggle admin access on or off. Admins cannot remove their own access.
- **THEO logo** — Purple hexagon logo with "THEO" wordmark, shown in the top-left corner after logging in and in the admin panel header.
- **Brand color** — Purple (`#5C5BF0`) applied consistently to all buttons and active states across the app.
- **ESPN score helper** (`src/lib/espn.ts`) — Internal module that handles all communication with the ESPN unofficial API, including converting kickoff times to Eastern time for correct date lookups.
- **Scoring helper** (`src/lib/scoring.ts`) — Internal module with the ATS (against the spread) calculation and points-earned calculation logic, shared across the app.
- **Admin database client** (`src/lib/supabase/admin.ts`) — A special internal database connection that uses the service role key, allowing admin actions to bypass row-level security when needed (e.g. reading all users' email addresses).
- **`requireAdmin()` helper** (`src/app/admin/actions/helpers.ts`) — A shared function used by every admin server action to verify the caller is a logged-in admin before doing anything. Prevents unauthorized access even if someone calls an action directly.

### Changed
- Home page (`/`) now redirects to `/auth` instead of showing the default Next.js boilerplate.
- Browser tab title changed from "Create Next App" to "THEO".
- Auth page (`/auth`) redesigned to match THEO branding: logo, purple button, clean dark layout.

### Fixed
- Production build now compiles without TypeScript errors (fixed a type annotation in the admin user list that was causing the build to fail).
- Score refresh now reports which individual games failed to update rather than stopping entirely if one game has a problem.
- Admin user list pagination now logs an error clearly instead of silently producing an incomplete list if an API call fails.
- Pick scoring now throws an explicit error if any pick update fails, instead of silently leaving some picks unscored while marking the game as final.

---

## [0.2.0] — 2026-04-13

### Added
- **Login page** — Users can log in with their email and password at `/auth`. Wrong credentials show a clear error message.
- **Sign-up page** — New users can create an account with a username, email, and password at the same `/auth` page. The login and sign-up forms share one page with a toggle between them.
- **Username rules** — Usernames must be 3–30 characters and can only contain letters, numbers, underscores (`_`), and hyphens (`-`). These rules are enforced before the form submits.
- **Automatic profile creation** — When someone signs up, a profile row is automatically created in the database by a trigger. No extra step needed.
- **Log out** — A "Log Out" button on the dashboard ends the session and sends the user back to `/auth`.
- **Protected routes** — Visitors who are not logged in are automatically redirected to `/auth` if they try to reach `/dashboard`, `/picks`, `/leaderboard`, `/groups`, or `/admin`.
- **Admin-only route** — Logged-in users without admin access who visit `/admin` are redirected to `/dashboard`.
- **Already logged in redirect** — Logged-in users who visit `/auth` are automatically sent to `/dashboard`.
- **Supabase client helpers** — Two internal helper files created: one for server-side code (`src/lib/supabase/server.ts`) and one for browser-side code (`src/lib/supabase/client.ts`).
- **Middleware** — A `src/middleware.ts` file now runs before every page load to enforce all login/redirect rules.

### Fixed
- Session cookies are now fully preserved (including security attributes) when the app redirects a user, preventing rare cases where users could be logged out unexpectedly.
- Signup error messages now correctly distinguish between a duplicate email, a duplicate username, and any other unexpected failure — instead of showing a misleading "username taken" message for all errors.

---

## [0.1.0] — 2026-04-08

### Added
- Initial Next.js 14 project scaffold with TypeScript and Tailwind CSS.
- Full database schema covering: users, sports, seasons, weeks, games, picks, groups, group members, and email logs.
- Row Level Security (RLS) enabled on all database tables — users can only access data they are allowed to see.
- Database trigger that automatically creates a user profile row whenever someone signs up.
- Placeholder pages for `/auth`, `/dashboard`, `/picks`, `/leaderboard`, `/groups`, and `/admin`.
