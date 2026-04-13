# Feature Implementation Plan: Authentication
**Overall Progress:** `100%`

## TLDR
We're building the login/signup system for THEO. Users will be able to create an account with an email, password, and username, log in, and log out. Once logged in, they can access the app. If they're not logged in and try to visit a protected page, they get sent to the login page automatically. We're using Supabase — the service that handles storing users and verifying passwords so we don't have to build that ourselves.

## Critical Decisions

- **One auth page with a toggle, not two pages:** `/auth` will show either the Login form or the Sign Up form, with a link to switch between them. Simpler to build and easier to use.
- **Username collected at sign-up:** The sign-up form will include a username field. That value gets passed to Supabase as metadata, and the `handle_new_user` database trigger automatically saves it to the `profiles` table.
- **Middleware handles route protection:** A special file called `middleware.ts` sits in front of every page request. It checks if the user is logged in before the page loads and redirects them if not. This is the recommended pattern for `@supabase/ssr`.
- **No email confirmation:** Supabase is configured with email confirmation turned off, so users land directly on `/dashboard` after signing up.
- **Admin-only route:** `/admin` gets an extra check — even if you're logged in, you must have `is_admin = true` in your profile to access it. Everyone else gets redirected to `/dashboard`.
- **Server-side Supabase client:** We'll create two Supabase client helpers — one for use inside server components/middleware (which can read secure cookies), and one for use in browser-side (client) components. This is required by `@supabase/ssr`.

## Tasks

- [x] 🟩 **Step 1: Create the Supabase client helper files**
  - [x] 🟩 Create `src/lib/supabase/server.ts` — the server-side Supabase client (used in middleware and server components to securely read the logged-in user)
  - [x] 🟩 Create `src/lib/supabase/client.ts` — the browser-side Supabase client (used in forms and interactive components)

- [x] 🟩 **Step 2: Create the middleware file**
  - [x] 🟩 Create `src/middleware.ts` at the root of `src/` — this file intercepts every page request before it loads
  - [x] 🟩 Protect `/dashboard`, `/picks`, `/leaderboard`, `/groups` — redirect unauthenticated users to `/auth`
  - [x] 🟩 Protect `/admin` — redirect unauthenticated users to `/auth`; redirect logged-in non-admins to `/dashboard`
  - [x] 🟩 Redirect already-logged-in users away from `/auth` to `/dashboard`

- [x] 🟩 **Step 3: Build the auth page UI**
  - [x] 🟩 Replace the placeholder at `src/app/auth/page.tsx` with the real auth page
  - [x] 🟩 Build the Log In form (email + password fields, submit button)
  - [x] 🟩 Build the Sign Up form (username + email + password fields, submit button)
  - [x] 🟩 Add a toggle link so users can switch between the two forms on the same page
  - [x] 🟩 Style with Tailwind: dark background, green accent color, clean and minimal

- [x] 🟩 **Step 4: Wire up the Log In form**
  - [x] 🟩 On submit, call Supabase's `signInWithPassword` method with the email and password
  - [x] 🟩 On success, redirect to `/dashboard`
  - [x] 🟩 On failure, show a clear error message to the user (e.g., "Invalid email or password")

- [x] 🟩 **Step 5: Wire up the Sign Up form**
  - [x] 🟩 On submit, call Supabase's `signUp` method, passing the username as metadata so the database trigger can save it
  - [x] 🟩 On success, redirect to `/dashboard`
  - [x] 🟩 On failure, show a clear error message (e.g., "Email already in use", "Username already taken")

- [x] 🟩 **Step 6: Add a Log Out button**
  - [x] 🟩 Create a small reusable logout button component at `src/components/LogoutButton.tsx`
  - [x] 🟩 On click, call Supabase's `signOut` method, then redirect to `/auth`
  - [x] 🟩 Place the button on the Dashboard page as a placeholder (full nav comes later)

- [x] 🟩 **Step 7: Verify everything works end-to-end**
  - [ ] 🟥 Confirm sign-up creates a user in Supabase Auth and a matching row in `profiles`
  - [ ] 🟥 Confirm login redirects to `/dashboard`
  - [ ] 🟥 Confirm logout redirects to `/auth`
  - [ ] 🟥 Confirm visiting a protected page while logged out redirects to `/auth`
  - [ ] 🟥 Confirm visiting `/auth` while logged in redirects to `/dashboard`
  - [ ] 🟥 Confirm visiting `/admin` while logged in but not an admin redirects to `/dashboard`
