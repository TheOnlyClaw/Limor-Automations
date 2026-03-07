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
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold tracking-tight">Limor Automations</div>
            <div className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300">
              Internal tool
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <nav className="flex items-center gap-2">
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
                      'rounded-xl border px-3 py-1.5 text-sm transition',
                      isActive
                        ? 'border-zinc-600 bg-zinc-900 text-zinc-50'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                )
              })}
            </nav>

            {userEmail || onSignOut ? (
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                {userEmail ? <div className="truncate">{userEmail}</div> : null}
                {onSignOut ? (
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
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

      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  )
}
