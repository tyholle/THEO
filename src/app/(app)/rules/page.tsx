// src/app/rules/page.tsx
//
// A plain-English explanation of how THEO works.
// This is a static page — no database queries needed.
// It lives at /rules and is linked from the bottom navigation.
//
// This is a Server Component (no 'use client') because it has
// no interactive elements — just styled text content.

export default function RulesPage() {
  return (
    // Dark background, padded content area, bottom padding so the
    // fixed nav bar doesn't cover the last rule
    <div className="px-5 pt-6 pb-28">

      {/* Page title */}
      <h1 className="text-brand-500 text-2xl font-bold tracking-tight mb-1">
        How to Play
      </h1>
      <p className="text-zinc-500 text-sm mb-10">
        Everything you need to know about THEO picks.
      </p>

      {/* Rules sections */}
      <div className="space-y-8 max-w-lg">

        {/* Section 1 */}
        <RuleSection
          number="01"
          title="Pick Against the Spread"
          body="Each week you'll see a slate of college football games. For every game, one team is favored (shown with a negative number like −7.5) and one is the underdog (shown with a positive number like +7.5). You're not just picking who wins — you're picking who covers the spread."
        />
        <RuleSection
          number="02"
          title="The Spread Explained"
          body="If Indiana is −7.5 and you pick them, Indiana needs to win by 8 or more points for your pick to be correct. If you pick the underdog at +7.5, they just need to lose by fewer than 8 (or win outright) for you to be right."
        />
        <RuleSection
          number="03"
          title="Points Per Game"
          body="Each game has a point value between 1 and 10 assigned by the admin. Higher-value games are worth more if you get them right. A correct pick earns you those points. A wrong pick earns you zero."
        />
        <RuleSection
          number="04"
          title="Double Down"
          body="Once you've made a pick on a game, you can Double Down on it. This doubles the risk: if you're right, you earn twice the point value. If you're wrong, you lose that same amount from your score. You can only Double Down on one game per week, and your season score can go negative."
        />
        <RuleSection
          number="05"
          title="Pick Lock Time"
          body="Picks lock 15 minutes before each game's kickoff. Once a game locks, you can no longer make or change that pick. Different games lock at different times, so check back throughout the day."
        />
        <RuleSection
          number="06"
          title="Leaderboard"
          body="Your total points across all scored games make up your season score. The leaderboard shows everyone's standing. Groups have their own leaderboard so you can compete against your friends specifically."
        />

        {/* Footer note */}
        <p className="text-zinc-600 text-xs pt-4 border-t border-zinc-800">
          More detailed rules and FAQs coming soon.
        </p>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// RuleSection
// A small reusable card for each rule. Keeps the layout consistent
// and easy to add more rules later.
// -----------------------------------------------------------------------
function RuleSection({
  number,
  title,
  body,
}: {
  number: string
  title: string
  body: string
}) {
  return (
    <div className="flex gap-4">
      {/* Number badge — large purple accent in the corner */}
      <div className="flex-none w-10 h-10 rounded-xl bg-brand-950 border border-brand-800
                      flex items-center justify-center mt-0.5">
        <span className="text-brand-400 text-xs font-black">{number}</span>
      </div>

      {/* Rule content */}
      <div>
        <h2 className="text-white font-bold text-base mb-1">{title}</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
