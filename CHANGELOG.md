# Changelog

All notable changes to THEO are recorded here in plain English.

---

## [Unreleased]

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
