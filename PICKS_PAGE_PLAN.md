# Feature Implementation Plan — Picks Page
**Overall Progress:** `100%` (10 of 10 steps complete)

---

## TLDR
We're building the main picks page where users see this week's college football games, tap a team to make their pick, and optionally "double down" on one game per week. The page lives at `/picks`, is mobile-first with a dark theme and purple accents, and shows live scores once games start. We're also building a bottom navigation bar that appears on all user-facing pages.

---

## Critical Decisions

- **Store logos/short names in the database, not fetched live** — When the admin enters an ESPN game ID, we save the team logo URL and short name (e.g. "Michigan") into the database at that moment. This means the picks page loads fast for every user without depending on ESPN at runtime. Easy to swap to a custom teams table later — just one component to update.
- **Optimistic pick saving** — When a user taps a team, the UI updates instantly and the save happens in the background. This feels like a real sports app instead of a slow form submission.
- **Single tab (no Weekly Slate / My Picks split)** — All games and picks live on one scrollable page. Keeps it simple and easy to scan.
- **URL param for selected week** — The active week is stored in the URL as `?week=3` so if you refresh the page or share the link, the same week stays selected.
- **Current week = most recent non-complete week** — No admin flag needed. The app figures out the current week automatically.
- **Hide sport row until 2+ sports exist** — Avoids a confusing single-button row while only College Football is live.
- **Logo fallback container** — Every logo is wrapped in a small dark circle so ESPN's transparent logos always look clean on the dark background. Easy to restyle.
- **Bottom nav tabs:** Games (`/picks`), Leagues (`/groups`), Leaderboard (`/leaderboard`), Rules (`/rules`).
- **Remove Pick included** — Shown in the card header before lock time, matches the reference mock exactly.
- **Double Down is red when active** — Stays red ("DOUBLED DOWN!!") even though THEO is purple — it reads as loud/urgent, which is the point.

---

## Tasks

- [ ] 🟥 **Step 1: Database Migration — Add Team Info Columns**
  - [ ] 🟥 Write a new SQL migration file that adds 4 columns to the `games` table: `home_short_name`, `away_short_name`, `home_logo_url`, `away_logo_url` (all text, nullable)
  - [ ] 🟥 Apply the migration in Supabase (paste into the SQL editor and run)
  - > **Why:** The picks page needs to show team logos and short names (e.g. "Michigan" not "Michigan Wolverines"). Storing them in the database at game-creation time means we never have to call ESPN during a page load.

- [ ] 🟥 **Step 2: Update ESPN Helper (`src/lib/espn.ts`)**
  - [ ] 🟥 Find where `lookupEspnGame` parses the ESPN API response
  - [ ] 🟥 Add extraction of `shortDisplayName` and `logos[0].href` for both home and away teams
  - [ ] 🟥 Return the 4 new fields alongside the existing ones
  - > **Why:** The ESPN API response already contains short names and logo URLs — we just haven't been reading them. This is where we grab them before saving to the database.

- [ ] 🟥 **Step 3: Update Admin Game Actions (`src/app/admin/actions/game.ts`)**
  - [ ] 🟥 Update `lookupEspnGame()` to return short names and logo URLs to the admin form
  - [ ] 🟥 Update `createGame()` to save the 4 new fields when a game is created
  - [ ] 🟥 Update `updateGame()` to save the 4 new fields when a game is edited
  - > **Why:** The admin panel is where games are created. We need to make sure the new columns get filled in automatically — the admin shouldn't have to type logos manually.

- [ ] 🟥 **Step 4: Build Bottom Navigation (`src/components/BottomNav.tsx`)**
  - [ ] 🟥 Create a client component (meaning it runs in the browser) with 4 tabs: Games, Leagues, Leaderboard, Rules
  - [ ] 🟥 Highlight the active tab in purple based on the current URL
  - [ ] 🟥 Add it to the root layout (`src/app/layout.tsx`) with logic to hide it on `/auth` and `/admin` routes
  - > **Why:** The bottom nav is how users move between the main sections of the app on mobile. It needs to be hidden on the login page and admin panel since those have their own navigation.

- [ ] 🟥 **Step 5: Build Rules Placeholder Page (`src/app/rules/page.tsx`)**
  - [ ] 🟥 Create a styled page matching the dark THEO theme
  - [ ] 🟥 Include a heading, brief description of how THEO works (ATS picks, point values, double-down), and a note that more detail is coming
  - > **Why:** The bottom nav links to `/rules` so that route needs to exist. It's a placeholder for now — content can be filled in later.

- [ ] 🟥 **Step 6: Picks Page — Server Data Layer (`src/app/picks/page.tsx`)**
  - [ ] 🟥 Fetch the active season and all its weeks from the database
  - [ ] 🟥 Read the `?week=N` URL param; fall back to the most recent non-complete week
  - [ ] 🟥 Fetch all games for the selected week (including the 4 new logo/name columns)
  - [ ] 🟥 Fetch the logged-in user's existing picks for that week
  - [ ] 🟥 Pass everything to the client component as props
  - > **Why:** In Next.js, Server Components run on the server and fetch data before the page loads. This means users see content immediately instead of waiting for the browser to load and then fetch data. Think of it like the kitchen preparing your meal before you even sit down.

- [ ] 🟥 **Step 7: Week Strip UI (`src/app/picks/WeekStrip.tsx`)**
  - [ ] 🟥 Render a horizontally scrollable row of week buttons ("Week 1", "Week 2", etc.)
  - [ ] 🟥 Highlight the active week in purple
  - [ ] 🟥 Clicking a week updates the URL param (`?week=N`) and reloads the game list
  - [ ] 🟥 Handle empty weeks gracefully (no weeks in DB yet)
  - > **Why:** Users need to browse past and future weeks. Storing the selection in the URL means it survives a page refresh and can be bookmarked or shared.

- [ ] 🟥 **Step 8: Game Card UI (`src/app/picks/GameCard.tsx`)**
  - [ ] 🟥 Card header: "AWAY @ HOME" title, kickoff time or live score ("Q3 · 14–7" / "FINAL · 28–21"), PTS badge, Remove Pick button
  - [ ] 🟥 Two team buttons: when neither is picked, both show equally (logo + short name + spread)
  - [ ] 🟥 Selected state: picked team expands with a purple gradient pill (logo + name), other team shrinks to logo-only chip
  - [ ] 🟥 Logo component: circular dark container wrapping the ESPN logo image, with a text abbreviation fallback if the image fails to load
  - [ ] 🟥 After game is final: green tint on the pick box if won, red tint if lost
  - [ ] 🟥 Locked state (within 15 min of kickoff): buttons disabled, no interaction possible
  - [ ] 🟥 Empty state: "New Slate Coming Soon..." card when no games exist for the week
  - > **Why:** This is the core UI of the app. Each game is a card. The visual interaction (expand/shrink) gives clear feedback about which team you've picked.

- [ ] 🟥 **Step 9: Pick Saving Logic (`src/app/picks/PicksClient.tsx`)**
  - [ ] 🟥 Wire up team button taps to save/update picks in the `picks` table via Supabase browser client
  - [ ] 🟥 Use optimistic updates: update the UI immediately, then confirm with the database in the background
  - [ ] 🟥 Handle switching picks (if user taps a different team, update the existing row instead of inserting a new one)
  - [ ] 🟥 Wire up Remove Pick: deletes the pick row from the database
  - [ ] 🟥 Enforce lock time: calculate `kickoff_at - 15 minutes` and disable buttons if past that time
  - > **Why:** The Supabase browser client can write directly to the database from the user's browser (RLS policies ensure they can only write their own picks). Optimistic updates make the app feel instant.

- [ ] 🟥 **Step 10: Double Down Logic**
  - [ ] 🟥 Show the Double Down bar only after the user has made a pick for that game
  - [ ] 🟥 Inactive state: dark bar with "DOUBLE DOWN" text
  - [ ] 🟥 Active state: red bar with "DOUBLED DOWN!!" in bold italic
  - [ ] 🟥 Enforce one double-down per week: if user already doubled down on a different game this week, toggle that one off before setting the new one (the database has a unique constraint as a safety net)
  - [ ] 🟥 Save `is_double_down` to the picks table; respect lock time (no changes after lock)
  - > **Why:** Double down is a high-stakes feature — getting it wrong twice in a week could hurt a user's score significantly. The UI needs to be very clear about which game has the double down active, and only one is ever allowed.
