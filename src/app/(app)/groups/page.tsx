// src/app/(app)/groups/page.tsx
//
// Redirect: the old /groups URL now lives at /leagues.
// This file keeps any bookmarked or linked /groups URLs working.
import { redirect } from 'next/navigation'

export default function GroupsRedirect() {
  redirect('/leagues')
}
