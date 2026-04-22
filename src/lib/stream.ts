// src/lib/stream.ts
//
// Server-only Stream Chat admin client.
//
// Stream Chat is a third-party service that handles real-time messaging.
// This file creates a privileged "admin" connection to Stream using the
// STREAM_API_SECRET key — this lets us create channels, add/remove members,
// and generate user tokens without involving the browser.
//
// ⚠️  NEVER import this file in a client component.
//     The secret key must only exist on the server.
//     Client components should use the public API key + a token from our
//     /api/stream/token endpoint instead.

import { StreamChat } from 'stream-chat'

// StreamChat.getInstance() creates a singleton — calling it multiple times
// with the same API key returns the same client instance, which is the
// correct pattern for a long-running server process.
export const streamAdmin = StreamChat.getInstance(
  process.env.NEXT_PUBLIC_STREAM_API_KEY!,
  process.env.STREAM_API_SECRET!,
)
