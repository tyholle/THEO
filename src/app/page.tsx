// src/app/page.tsx
// Root landing page — redirects everyone to /auth.
// Logged-in users are then sent on to /picks by the auth page logic.
// This prevents anyone from seeing the default Next.js boilerplate at /.

import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/auth')
}
