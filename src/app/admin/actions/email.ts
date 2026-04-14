'use server'
// src/app/admin/actions/email.ts
// Server Actions for Section 4: Email Management.
//
// Two actions:
//   1. generateEmailDraft — uses Claude AI to write game-by-game commentary
//   2. sendWeeklyEmail    — sends the email to all opted-in users via Resend
//                          and logs the send in email_log

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { requireAdmin } from './helpers'

// -----------------------------------------------------------------------
// generateEmailDraft
// Fetches all games for the selected week, then asks Claude to write
// engaging preview commentary for each matchup.
//
// Returns the full draft as a plain text string that the admin can edit.
// -----------------------------------------------------------------------
export async function generateEmailDraft(weekId: string) {
  try {
    const { supabase } = await requireAdmin()

    // Fetch the week info (to know the label, e.g. "Week 5")
    const { data: week, error: weekError } = await supabase
      .from('weeks')
      .select('label, week_number')
      .eq('id', weekId)
      .single()

    if (weekError || !week) return { error: 'Week not found.' }

    // Fetch all games for this week, sorted by kickoff time
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('home_team, away_team, spread, spread_favors, point_value, kickoff_at')
      .eq('week_id', weekId)
      .order('kickoff_at', { ascending: true })

    if (gamesError) return { error: gamesError.message }
    if (!games || games.length === 0) {
      return { error: 'No games found for this week. Add games before generating a draft.' }
    }

    // Build a clear description of each game for Claude
    // Format: "Away Team at Home Team — Line: Home -7.5 — Worth 8 points"
    const gameDescriptions = games.map((g, i) => {
      const favoredTeam = g.spread_favors === 'home' ? g.home_team : g.away_team
      const spread = Math.abs(g.spread)
      const kickoff = new Date(g.kickoff_at).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
        timeZoneName: 'short',
      })
      return `Game ${i + 1}: ${g.away_team} at ${g.home_team}
  Kickoff: ${kickoff}
  Spread: ${favoredTeam} -${spread}
  Point value: ${g.point_value} point${g.point_value !== 1 ? 's' : ''}`
    }).join('\n\n')

    // Build the prompt for Claude
    const prompt = `You are writing the weekly preview email for THEO, a college football pick'em app where users pick against the spread.

This week is ${week.label}. Here are the games:

${gameDescriptions}

Write an engaging, fun weekly preview email. For each game:
- Start with the matchup (Away at Home)
- Include the spread and point value
- Write 2-4 sentences of genuine analysis and commentary — talk about team form, key players, trends, or storylines. Be opinionated and confident.
- Keep a conversational, slightly irreverent tone (like a knowledgeable friend, not a press release)

End with a short "Good luck this week!" type sign-off.

Write in plain text only — no markdown, no bullet points, no headers with #. Just clean readable paragraphs.`

    // Call the Claude API
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    // Extract the text content from Claude's response
    const draftText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n')

    // Suggest a subject line
    const defaultSubject = `THEO Pick'em — ${week.label} Preview`

    return { success: true, draft: draftText, defaultSubject }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -----------------------------------------------------------------------
// sendWeeklyEmail
// Sends the final (possibly edited) email to all opted-in users.
// Logs the send to email_log.
// -----------------------------------------------------------------------
export async function sendWeeklyEmail(formData: FormData) {
  try {
    const { supabase, user } = await requireAdmin()
    const adminClient = createAdminClient()

    const weekId  = String(formData.get('week_id') ?? '').trim()
    const subject = String(formData.get('subject') ?? '').trim()
    const body    = String(formData.get('body') ?? '').trim()

    if (!weekId || !subject || !body) {
      return { error: 'Week, subject, and body are required.' }
    }

    // --- Get all opted-in user profiles ---
    const { data: optedInProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email_opt_in', true)

    if (profilesError) return { error: profilesError.message }
    if (!optedInProfiles || optedInProfiles.length === 0) {
      return { error: 'No users are opted in to emails.' }
    }

    // --- Get their actual email addresses from auth.users ---
    // We need the admin client to read auth.users.
    // We paginate through all pages so no user is silently missed if the
    // total exceeds 1000.
    const optedInIds = optedInProfiles.map(p => p.id)

    const allAuthUsers: { id: string; email?: string }[] = []
    let page = 1
    while (true) {
      const { data, error: pageError } = await adminClient.auth.admin.listUsers({ perPage: 1000, page })
      if (pageError) return { error: pageError.message }
      if (!data.users.length) break
      allAuthUsers.push(...data.users)
      if (data.users.length < 1000) break
      page++
    }

    const recipientEmails = allAuthUsers
      .filter(u => optedInIds.includes(u.id) && u.email)
      .map(u => u.email as string)

    if (recipientEmails.length === 0) {
      return { error: 'No email addresses found for opted-in users.' }
    }

    // --- Send the email via Resend ---
    const resend = new Resend(process.env.RESEND_API_KEY!)
    const fromEmail = process.env.RESEND_FROM_EMAIL!

    // Send as a batch — one email per recipient
    // Each person gets the same content but their own individual email
    const emailBatch = recipientEmails.map(email => ({
      from: `THEO Pick'em <${fromEmail}>`,
      to: email,
      subject,
      text: body,
    }))

    const { error: sendError } = await resend.batch.send(emailBatch)
    if (sendError) return { error: `Resend error: ${JSON.stringify(sendError)}` }

    // --- Log the send to email_log ---
    const { error: logError } = await supabase.from('email_log').insert({
      week_id: weekId,
      sent_by: user.id,
      recipient_count: recipientEmails.length,
      subject,
    })

    if (logError) {
      // The email was sent, so don't return an error — just log it server-side
      console.error('Failed to write email_log entry:', logError.message)
    }

    revalidatePath('/admin')
    return { success: true, recipientCount: recipientEmails.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
