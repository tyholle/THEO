import AppHeader from '@/components/AppHeader'

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // flex flex-col h-screen: fixes the app shell to exactly the viewport height.
    // AppHeader gets its natural height; the scrollable wrapper below it fills the rest.
    //
    // Why this matters: the old "min-h-screen" approach let AppHeader + page content
    // exceed 100vh, causing the browser to scroll the page. That broke Stream Chat's
    // coordinate math (window.scrollY was non-zero, so position: fixed menus landed
    // in the wrong spot). With this layout, window.scrollY is always 0 and Stream's
    // menus appear correctly next to the messages.
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      {/* flex-1 overflow-y-auto: pages that need to scroll (picks, leaderboard, etc.)
          scroll within this div instead of the browser viewport. Visually identical
          to users; functionally keeps window.scrollY at 0. min-h-0 is required on
          flex children to allow shrinking below their natural height. */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {children}
      </div>
    </div>
  )
}
