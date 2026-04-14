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

// -----------------------------------------------------------------------
// TypeScript types
// These describe the shape of the data we get back from ESPN.
// Think of them as a contract: "ESPN will give us data that looks like this."
// -----------------------------------------------------------------------

// A single game returned from ESPN (either scoreboard or summary endpoint).
export type EspnGame = {
  espnGameId: string      // ESPN's unique ID for this game (e.g. "401628423")
  homeTeam: string        // Full name, e.g. "Ohio State Buckeyes"
  awayTeam: string        // Full name, e.g. "Alabama Crimson Tide"
  kickoffAt: string       // ISO 8601 timestamp, e.g. "2025-09-06T17:00:00Z"
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
  team: { displayName: string }
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

  return {
    espnGameId: eventId,
    homeTeam: home.team?.displayName ?? '',
    awayTeam: away.team?.displayName ?? '',
    kickoffAt: eventDate,
    homeScore: home.score != null ? Number(home.score) : null,
    awayScore: away.score != null ? Number(away.score) : null,
    status: mapEspnStatus(statusName),
  }
}

// -----------------------------------------------------------------------
// fetchScoresByDate
// Calls the ESPN scoreboard endpoint for a specific date and returns
// all games found on that date.
//
// The date parameter must be in YYYYMMDD format (e.g. "20250906").
// -----------------------------------------------------------------------
export async function fetchScoresByDate(date: string): Promise<EspnGame[]> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${date}`

  try {
    const res = await fetch(url, {
      // next.revalidate: 0 means "don't cache this" — we always want live data
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.error(`ESPN scoreboard fetch failed for date ${date}: ${res.status}`)
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
export async function fetchGameById(espnGameId: string): Promise<EspnGame | null> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${espnGameId}`

  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      console.error(`ESPN game summary fetch failed for ID ${espnGameId}: ${res.status}`)
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
