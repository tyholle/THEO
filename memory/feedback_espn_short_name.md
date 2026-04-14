---
name: ESPN shortName preference
description: User prefers ESPN shortName (e.g. "Ohio State") over displayName (e.g. "Ohio State Buckeyes") for team names in games
type: feedback
---

Use ESPN's `shortName` field instead of `displayName` when auto-filling team names on game creation.

**Why:** displayName returns full names like "Ohio State Buckeyes" which is verbose. shortName returns cleaner names like "Ohio State" or "OSU" that look better in the UI, emails, and leaderboards.

**How to apply:** In `src/lib/espn.ts`, the `EspnCompetitor` interface and `parseCompetition` function use `team.displayName`. Change to `team.shortDisplayName` or `team.abbreviation` when the ESPN short name improvement pass happens. The user noted this is deferred — do not change it now unless explicitly asked.
