import type { ReactNode } from 'react'

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type NavItem = {
  key: 'dashboard' | 'settings'
  label: string
  href: string
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'settings', label: 'Settings', href: '/settings' },
]

export function AppShell({
  active,
  onNavigate,
  userEmail,
  onSignOut,
  children,
}: {
  active: NavItem['key']
  onNavigate: (href: string) => void
  userEmail?: string | null
  onSignOut?: () => Promise<void>
  children: ReactNode
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_55%)]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-300/20 to-pink-400/10 text-sm font-semibold text-amber-100 shadow-[0_12px_32px_rgba(251,146,60,0.18)]">
              LA
            </div>
            <div>
              <div className="font-semibold tracking-tight text-zinc-50">Limor Automations</div>
              <div className="mt-1 text-sm text-zinc-400">
                Quiet operational control for replies, DMs, and connection health.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <nav className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {NAV.map((item) => {
                const isActive = item.key === active
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault()
                      onNavigate(item.href)
                    }}
                    className={clsx(
                      'rounded-xl px-3 py-2 text-sm transition',
                      isActive
                        ? 'bg-gradient-to-r from-amber-300 to-orange-300 text-zinc-950 shadow-lg shadow-amber-500/15'
                        : 'text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                )
              })}
              </nav>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                Internal tool
              </div>
            </div>

            {userEmail || onSignOut ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                {userEmail ? (
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-zinc-300">
                    {userEmail}
                  </div>
                ) : null}
                {onSignOut ? (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/[0.08]"
                    onClick={() => void onSignOut()}
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
    </div>
  )
}
