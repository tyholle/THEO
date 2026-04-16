import AppHeader from '@/components/AppHeader'

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      {children}
    </div>
  )
}
