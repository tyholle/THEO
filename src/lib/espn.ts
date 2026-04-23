// src/lib/espn.ts
// This file is the ONLY place in the entire app that talks to the ESPN API.
// If ESPN ever changes their URLs or data format, we fix it here and nowhere else.
//
// ESPN uses an "unofficial" public API — no API key required, but the data format
// can change without warning. We wrap it here so the rest of the app never
// needs to know the details.
//
// Two endpoints are used:
//   1. Scoreboard — all games for a given date
//   2. Game Summary — one specific game by its ESPN ID
//
// MULTI-SPORT: Every function takes a `sportSlug` parameter (e.g. "cfb", "nfl")
// that is mapped to ESPN's URL path via ESPN_SPORT_PATHS below.
// To add a new sport, just add its slug → ESPN path entry to that map.

// -----------------------------------------------------------------------
// ESPN_SPORT_PATHS
// Maps our short slug (stored in the sports.slug column) to the path
// segment ESPN uses in their API URLs.
//
// To find a new sport's path: open espn.com, go to that sport's scoreboard,
// and look at the URL — e.g. "espn.com/nfl/scoreboard" → slug is "nfl",
// and the API path is "football/nfl".
// -----------------------------------------------------------------------
export const ESPN_SPORT_PATHS: Record<string, string> = {
  'cfb':  'football/college-football',
  'nfl':  'football/nfl',
  'nba':  'basketball/nba',
  'mlb':  'baseball/mlb',
  'nhl':  'hockey/nhl',
}

// Helper: converts our sport slug to an ESPN URL path segment, or throws
// a clear error if the slug isn't in the map above.
export function getEspnPath(sportSlug: string): string {
  const path = ESPN_SPORT_PATHS[sportSlug.toLowerCase()]
  if (!path) {
    throw new Error(
      `No ESPN path configured for sport slug "${sportSlug}". ` +
      `Add it to ESPN_SPORT_PATHS in src/lib/espn.ts.`
    )
  }
  return path
}

// -----------------------------------------------------------------------
// TypeScript types
// These describe the shape of the data we get back from ESPN.
// Think of them as a contract: "ESPN will give us data that looks like this."
// -----------------------------------------------------------------------

// A single game returned from ESPN (either scoreboard or summary endpoint).
export type EspnGame = {
  espnGameId: string        // ESPN's unique ID for this game (e.g. "401628423")
  homeTeam: string          // Short name, e.g. "Ohio State"
  awayTeam: string          // Short name, e.g. "Alabama"
  homeShortName: string     // Short display name, e.g. "Ohio State"
  awayShortName: string     // Short display name, e.g. "Alabama"
  homeLogoUrl: string | null  // ESPN CDN URL for the home team's logo image
  awayLogoUrl: string | null  // ESPN CDN URL for the away team's logo image
  // Primary color as 6 hex digits (e.g. "990000") from ESPN; null if missing
  homeTeamColor: string | null
  awayTeamColor: string | null
  kickoffAt: string         // ISO 8601 timestamp, e.g. "2025-09-06T17:00:00Z"
  homeScore: number | null
  awayScore: number | null
  status: 'scheduled' | 'in_progress' | 'final'
}

// -----------------------------------------------------------------------
// ESPN status → our status mapping
// ESPN uses strings like "STATUS_FINAL" — we convert those to our own
// simpler strings: "scheduled", "in_progress", or "final".
// -----------------------------------------------------------------------
function mapEspnStatus(typeName: string): EspnGame['status'] {
  // Any "final" state (including overtime wins)
  if (typeName.startsWith('STATUS_FINAL')) return 'final'
  // Active game states
  if (
    typeName === 'STATUS_IN_PROGRESS' ||
    typeName === 'STATUS_HALFTIME' ||
    typeName === 'STATUS_END_PERIOD'
  ) {
    return 'in_progress'
  }
  // Default: not started yet
  return 'scheduled'
}

// -----------------------------------------------------------------------
// Internal ESPN response shapes
// ESPN's API is not officially documented, so we define just enough
// structure to extract the fields we need. Using `unknown` at the boundary
// and narrowing through these interfaces avoids unsafe `any` types.
// -----------------------------------------------------------------------
interface EspnCompetitor {
  homeAway: string
  team: {
    displayName: string
    // shortDisplayName is ESPN's condensed name, e.g. "Ohio State" vs "Ohio State Buckeyes"
    shortDisplayName?: string
    // name is the nickname only, e.g. "Giants" — present in the summary endpoint
    // where shortDisplayName is absent
    name?: string
    // Primary team color, usually 6 hex chars without # (e.g. "990000")
    color?: string
    // logos is an array of image objects; we grab the first one's URL
    logos?: Array<{ href: string; rel?: string[] }>
  }
  score: string | number | null | undefined
}

interface EspnCompetition {
  competitors: EspnCompetitor[]
  status: { type: { name: string } }
}

interface EspnEvent {
  id: string
  date: string
  competitions: EspnCompetition[]
}

// -----------------------------------------------------------------------
// parseCompetition
// ESPN wraps each game in a "competition" object. This helper extracts
// the data we care about from that object.
// -----------------------------------------------------------------------
function parseCompetition(eventId: string, eventDate: string, comp: EspnCompetition): EspnGame | null {
  const competitors = comp.competitors
  if (!competitors || competitors.length < 2) return null

  const home = competitors.find(c => c.homeAway === 'home')
  const away = competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const statusName: string = comp.status?.type?.name ?? 'STATUS_SCHEDULED'

  // ESPN sometimes provides a "dark" logo variant (white logo, good for dark backgrounds).
  // We prefer it for THEO's dark UI. Fall back to the first logo if no dark variant exists.
  function pickLogo(logos?: Array<{ href: string; rel?: string[] }>): string | null {
    if (!logos || logos.length === 0) return null
    const dark = logos.find(l => l.rel?.includes('dark'))
    return (dark ?? logos[0]).href
  }

  // ESPN sometimes includes "#" on color; we store 6 lowercase hex digits only.
  function normalizeTeamColor(c: string | undefined): string | null {
    if (!c) return null
    const s = c.replace(/^#/, '').trim().toLowerCase()
    return /^[0-9a-f]{6}$/.test(s) ? s : null
  }

  return {
    espnGameId:    eventId,
    homeTeam:      home.team?.shortDisplayName ?? home.team?.name ?? home.team?.displayName ?? '',
    awayTeam:      away.team?.shortDisplayName ?? away.team?.name ?? away.team?.displayName ?? '',
    // Fallback chain: shortDisplayName (scoreboard) → name (summary) → displayName (always present)
    homeShortName: home.team?.shortDisplayName ?? home.team?.name ?? home.team?.displayName ?? '',
    awayShortName: away.team?.shortDisplayName ?? away.team?.name ?? away.team?.displayName ?? '',
    homeLogoUrl:   pickLogo(home.team?.logos),
    awayLogoUrl:   pickLogo(away.team?.logos),
    homeTeamColor: normalizeTeamColor(home.team?.color),
    awayTeamColor: normalizeTeamColor(away.team?.color),
    kickoffAt:     eventDate,
    homeScore:     home.score != null ? Number(home.score) : null,
    awayScore:     away.score != null ? Number(away.score) : null,
    status:        mapEspnStatus(statusName),
  }
}

// -----------------------------------------------------------------------
// fetchScoresByDate
// Calls the ESPN scoreboard endpoint for a specific date and returns
// all games found on that date.
//
// The date parameter must be in YYYYMMDD format (e.g. "20250906").
// -----------------------------------------------------------------------
export async function fetchScoresByDate(date: string, sportSlug: string): Promise<EspnGame[]> {
  const sportPath = getEspnPath(sportSlug)
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard?dates=${date}`

  try {
    const res = await fetch(url, {
      // next.revalidate: 0 means "don't cache this" — we always want live data
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.error(`ESPN scoreboard fetch failed for ${sportSlug} on ${date}: ${res.status}`)
      return []
    }

    const json = await res.json()
    const events: EspnEvent[] = json.events ?? []

    const games: EspnGame[] = []
    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const game = parseCompetition(event.id, event.date, comp)
      if (game) games.push(game)
    }

    return games
  } catch (err) {
    console.error(`ESPN scoreboard fetch error for date ${date}:`, err)
    return []
  }
}

// -----------------------------------------------------------------------
// fetchGameById
// Calls the ESPN game summary endpoint for ONE specific game.
// Used as a fallback when a game doesn't appear in the scoreboard results.
// Also used when admin types an ESPN game ID to auto-fill the add game form.
// -----------------------------------------------------------------------
export async function fetchGameById(espnGameId: string, sportSlug: string): Promise<EspnGame | null> {
  const sportPath = getEspnPath(sportSlug)
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${espnGameId}`

  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.error(`ESPN game summary fetch failed for ${sportSlug} game ${espnGameId}: ${res.status}`)
      return null
    }

    const json = await res.json()

    // The summary endpoint wraps the game in a "header" → "competitions" structure
    const comp = json.header?.competitions?.[0]
    const eventDate: string = json.header?.competitions?.[0]?.date ?? ''

    if (!comp) return null
    return parseCompetition(espnGameId, eventDate, comp)
  } catch (err) {
    console.error(`ESPN game summary fetch error for ID ${espnGameId}:`, err)
    return null
  }
}

// -----------------------------------------------------------------------
// toEspnDate
// Converts a timestamp (stored in our database as UTC) to the YYYYMMDD
// date string that ESPN's scoreboard endpoint expects.
//
// College football games happen in US timezones. If a game kicks off at
// 8 PM Eastern on Saturday, that's midnight UTC on Sunday. We convert
// to US Eastern time so the date matches what ESPN uses.
// -----------------------------------------------------------------------
export function toEspnDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  // 'en-CA' locale gives YYYY-MM-DD format; we then strip the dashes
  return date
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .replace(/-/g, '')
}
