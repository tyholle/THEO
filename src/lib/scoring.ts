// src/lib/scoring.ts
// Pure utility functions for ATS (Against The Spread) calculation and scoring.
//
// "Pure function" means: given the same inputs, always returns the same output.
// No database calls, no network calls — just math.
//
// These live here (not in the server actions file) because Next.js requires
// every export in a 'use server' file to be an async function. These functions
// don't need async, so they live in a plain utility file instead.

// -----------------------------------------------------------------------
// calculateAtsResult
// Given final scores and the spread, returns who covered.
//
// How spreads work in THEO:
//   spread is always a negative number (e.g. -7.5)
//   spread_favors tells us which team that negative applies to
//
//   spread = -7.5, spread_favors = 'home'
//     → Home is favored by 7.5 points.
//     → Home covers if they WIN BY MORE THAN 7.5.
//
//   spread = -7.5, spread_favors = 'away'
//     → Away is favored by 7.5 points.
//     → Away covers if they WIN BY MORE THAN 7.5.
//
// margin = home_score - away_score
//   positive = home team is winning
//   negative = away team is winning
// -----------------------------------------------------------------------
export function calculateAtsResult(
  homeScore: number,
  awayScore: number,
  spread: number,
  spreadFavors: 'home' | 'away'
): 'home' | 'away' | 'push' {
  const margin = homeScore - awayScore  // positive = home winning
  const line = Math.abs(spread)         // e.g. 7.5

  if (spreadFavors === 'home') {
    // Home is favored. They must win by MORE than the line to cover.
    if (margin > line) return 'home'
    if (margin === line) return 'push'  // impossible with half-point spreads
    return 'away'
  } else {
    // Away is favored. They must win by MORE than the line to cover.
    // Away winning by more than line = margin < -line
    if (-margin > line) return 'away'
    if (-margin === line) return 'push' // impossible with half-point spreads
    return 'home'
  }
}

// -----------------------------------------------------------------------
// calculatePointsEarned
// Returns how many points a pick earns based on the game result.
//
// Scoring rules:
//   Correct pick, no double-down:  +point_value
//   Wrong pick,   no double-down:   0
//   Correct pick, double-down:     +point_value × 2
//   Wrong pick,   double-down:     −point_value × 2
//   Game void or push:              0
// -----------------------------------------------------------------------
export function calculatePointsEarned(
  pickedTeam: 'home' | 'away',
  isDoubleDown: boolean,
  atsResult: 'home' | 'away' | 'push' | 'void',
  pointValue: number
): number {
  if (atsResult === 'void' || atsResult === 'push') return 0

  const correct = pickedTeam === atsResult

  if (isDoubleDown) {
    return correct ? pointValue * 2 : -(pointValue * 2)
  } else {
    return correct ? pointValue : 0
  }
}
