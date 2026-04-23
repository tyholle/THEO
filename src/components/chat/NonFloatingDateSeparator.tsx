'use client'

import {
  DateSeparator as StreamDateSeparator,
  type DateSeparatorProps,
} from 'stream-chat-react'

// Keep normal in-list date pills, but suppress Stream's extra floating pill.
export default function NonFloatingDateSeparator(props: DateSeparatorProps) {
  if (props.floating) return null
  return <StreamDateSeparator {...props} />
}
