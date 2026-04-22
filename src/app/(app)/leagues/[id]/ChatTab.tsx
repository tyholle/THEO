'use client'
// src/app/(app)/leagues/[id]/ChatTab.tsx
//
// The Chat tab rendered inside the league detail page.
//
// What this file does:
//   1. On first render, calls ensureStreamChannel() (server action) to get or
//      create the Stream channel for this league.
//   2. Fetches a signed user token from our /api/stream/token endpoint.
//   3. Connects to Stream Chat using the public API key + that token.
//   4. Renders Stream's pre-built message list, input box, and reactions,
//      styled to match THEO's dark zinc/purple color scheme.
//
// Stream Chat React uses a tree of context providers:
//   <Chat>      — provides the connected client to everything below
//   <Channel>   — provides the specific channel (the league's chat room)
//   <Window>    — handles layout (splits list vs input)
//   <MessageList> / <MessageInput> — the actual UI

import { useEffect, useState } from 'react'
import { StreamChat, type Channel } from 'stream-chat'
import {
  Chat,
  Channel as StreamChannel,
  MessageComposer,
  MessageList,
  Window,
} from 'stream-chat-react'
import 'stream-chat-react/dist/css/index.css'
import { ensureStreamChannel } from '../actions'

// -----------------------------------------------------------------------
// Note on custom reactions (6 fixed emoji):
// In stream-chat-react v14 the reactionOptions prop moved off <Channel>.
// The fixed emoji set (👍 ❤️ 😂 😮 🔥 😭) will be wired up via the
// MessageComposer configuration in a follow-up once the v14 API is confirmed.
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// THEO dark theme — CSS variables that override Stream's default styling.
// Stream Chat React applies these via the str-chat__theme-dark class.
// We use a <div style={...}> wrapper to set them in scope.
//
// brand-500 = #5C5BF0 (THEO purple)
// zinc-950  = #09090b  (page background)
// zinc-900  = #18181b  (card background)
// zinc-800  = #27272a  (borders)
// zinc-700  = #3f3f46  (input background)
// zinc-200  = #e4e4e7  (primary text)
// zinc-400  = #a1a1aa  (secondary text)
// -----------------------------------------------------------------------
const STREAM_THEME_VARS: React.CSSProperties = {
  // Background layers
  '--str-chat__background-color':                    '#18181b',
  '--str-chat__secondary-background-color':          '#09090b',
  '--str-chat__message-input-background-color':      '#27272a',
  // Own message bubbles (messages sent by the current user)
  '--str-chat__own-message-bubble-background-color': '#3837A0',
  // Other members' message bubbles
  '--str-chat__message-bubble-background-color':     '#27272a',
  // Text
  '--str-chat__text-color':                          '#e4e4e7',
  '--str-chat__secondary-text-color':                '#a1a1aa',
  // Accent (send button, reactions selected state, etc.)
  '--str-chat__primary-color':                       '#5C5BF0',
  '--str-chat__active-primary-color':                '#7B7AF4',
  // Border
  '--str-chat__border-color':                        '#27272a',
  // Reaction picker background
  '--str-chat__tooltip-background-color':            '#27272a',
} as React.CSSProperties

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------
type Props = {
  leagueId:        string  // The league's database UUID — also the channel ID
  currentUserId:   string  // Supabase auth user ID
  currentUsername: string  // THEO username — shown on messages
}

// -----------------------------------------------------------------------
// ChatTab
// -----------------------------------------------------------------------
export default function ChatTab({ leagueId, currentUserId, currentUsername }: Props) {
  // The Stream client — created once per session and reused
  const [client, setClient]   = useState<StreamChat | null>(null)
  // The specific channel object for this league
  const [channel, setChannel] = useState<Channel | null>(null)
  // Any connection error to show to the user
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    // mounted tracks whether this effect is still active.
    // Each time the effect runs (mount/remount), a fresh closure is created
    // with mounted = true. The cleanup sets it to false so any in-flight
    // async work knows to abort rather than set stale state.
    let mounted = true
    let chatClient: StreamChat | null = null
    // Track the active channel so cleanup can stop watching it
    let activeChannel: Channel | null = null

    async function connect() {
      try {
        // Step 1: Ensure the Stream channel exists (lazy creation if needed)
        const channelResult = await ensureStreamChannel(leagueId)
        // Check mounted after every await — if the component unmounted while
        // we were waiting (e.g. tab switch), stop and don't set any state.
        if (!mounted) return
        if ('error' in channelResult) {
          setError(channelResult.error ?? 'Could not load chat.')
          return
        }

        // Step 2: Get a signed token for this user from our API route
        const tokenRes = await fetch('/api/stream/token')
        if (!mounted) return
        if (!tokenRes.ok) {
          setError('Could not authenticate with chat service.')
          return
        }
        const { token } = await tokenRes.json()
        if (!mounted) return

        // Step 3: Initialize the Stream Chat client.
        // StreamChat.getInstance() returns the same singleton each time —
        // safe to call multiple times across tab switches.
        // Guard against a missing env var so we get a clear error message
        // rather than a cryptic internal crash from the Stream SDK.
        const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
        if (!apiKey) {
          setError('Chat is not configured. Please contact support.')
          return
        }
        chatClient = StreamChat.getInstance(apiKey)

        // Step 4: Connect the user only if not already connected.
        // If the user switched away from the Chat tab and back, the singleton
        // client is still connected — calling connectUser twice throws.
        if (!chatClient.userID) {
          await chatClient.connectUser(
            { id: currentUserId, name: currentUsername },
            token,
          )
        }
        if (!mounted) return

        // Step 5: Get a reference to the channel and "watch" it.
        // watch() subscribes to live updates (new messages, reactions, etc.)
        // Calling watch() on an already-watched channel is safe and idempotent.
        const ch = chatClient.channel('messaging', channelResult.channelId)
        await ch.watch()
        if (!mounted) return

        activeChannel = ch  // save so cleanup can stopWatching
        setClient(chatClient)
        setChannel(ch)
      } catch (err) {
        if (!mounted) return
        console.error('Stream Chat connection error:', err)
        setError('Could not connect to chat. Please try again.')
      }
    }

    connect()

    // Cleanup: called when the ChatTab unmounts (tab switch or page navigation).
    //
    // We intentionally do NOT call client.disconnectUser() here.
    // Stream's MessageComposer runs async initialization (initState) after
    // mounting — if we disconnect the client while that's still in flight,
    // Stream throws "can't use a channel after client.disconnect()".
    //
    // Instead we just stop watching the channel (cancels live event subscriptions)
    // and let the singleton client stay alive. The client naturally times out
    // when the user closes the tab, or we can disconnect explicitly on logout.
    // If the user opens the Chat tab again, we re-watch without reconnecting.
    return () => {
      mounted = false
      if (activeChannel) {
        activeChannel.stopWatching().catch(console.warn)
      }
    }
  }, [leagueId, currentUserId, currentUsername])

  // ---- Error state ----
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  // ---- Loading state ----
  if (!client || !channel) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-zinc-500 text-sm animate-pulse">Connecting to chat…</div>
      </div>
    )
  }

  // ---- Chat UI ----
  return (
    // The outer div sets the THEO color overrides as CSS variables.
    // Stream reads these variables to style all of its child components.
    <div style={STREAM_THEME_VARS} className="h-[calc(100vh-280px)] min-h-[400px]">
      {/*
        Chat — provides the Stream client to everything below via React context.
        theme="str-chat__theme-dark" applies Stream's built-in dark mode class,
        which our CSS variables above then override with THEO's exact colors.
      */}
      <Chat client={client} theme="str-chat__theme-dark">
        {/*
          StreamChannel — provides the specific channel context.
          All child components can access the channel via React context.
        */}
        <StreamChannel channel={channel}>
          {/*
            Window — splits the view into the message list (scrollable area)
            and the message input (pinned to the bottom).
          */}
          <Window>
            {/*
              MessageList — renders all messages with avatars, timestamps,
              reaction counts, and the reaction picker on hover/tap.
              No custom props needed — Stream handles everything.
            */}
            <MessageList />

            {/*
              MessageComposer — the text box + send button at the bottom.
              In stream-chat-react v14, MessageInput was renamed MessageComposer.
            */}
            <MessageComposer />
          </Window>
        </StreamChannel>
      </Chat>
    </div>
  )
}
