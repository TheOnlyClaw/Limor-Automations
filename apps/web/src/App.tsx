import { useEffect, useState } from 'react'
import { AuthGate } from './auth/AuthGate'
import { SettingsPage } from './settings/SettingsPage'
import { AppShell } from './shell/AppShell'
import { DashboardPage } from './dashboard/DashboardPage'

function normalizePathname(p: string) {
  if (p === '/login') return '/login'
  if (p === '/' || p === '/dashboard') return '/dashboard'
  if (p === '/settings') return '/settings'
  return '/dashboard'
}

export default function App() {
  const [path, setPath] = useState(() => normalizePathname(window.location.pathname))

  function navigate(href: string, opts?: { replace?: boolean }) {
    if (href === window.location.pathname && !opts?.replace) return
    if (opts?.replace) window.history.replaceState(null, '', href)
    else window.history.pushState(null, '', href)
    setPath(href)
  }

  useEffect(() => {
    function onPop() {
      setPath(normalizePathname(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const normalized = normalizePathname(window.location.pathname)
    if (normalized !== window.location.pathname) {
      window.history.replaceState(null, '', normalized)
    }
  }, [])

  return (
    <AuthGate>
      {({ user, signOut }) => {
        const userEmail = user.email ?? null
        const activePath = path === '/login' ? '/dashboard' : path

        if (activePath === '/settings') {
          return <SettingsPage onNavigate={navigate} userEmail={userEmail} onSignOut={signOut} />
        }

        return (
          <AppShell active="dashboard" onNavigate={navigate} userEmail={userEmail} onSignOut={signOut}>
            <DashboardPage onGoToSettings={() => navigate('/settings')} />
          </AppShell>
        )
      }}
    </AuthGate>
  )
}
