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

const basePath = import.meta.env.BASE_URL ?? '/'
const basePrefix = basePath === '/' ? '' : basePath.replace(/\/+$/g, '')

function stripBasePath(pathname: string) {
  if (!basePrefix) return pathname
  if (pathname === basePrefix) return '/'
  if (pathname.startsWith(`${basePrefix}/`)) return pathname.slice(basePrefix.length)
  return pathname
}

function withBasePath(pathname: string) {
  if (!basePrefix) return pathname
  if (pathname === '/') return `${basePrefix}/`
  if (pathname.startsWith(`${basePrefix}/`)) return pathname
  return `${basePrefix}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

function readRedirectPath() {
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect')
  if (!redirect) return null
  const [pathPart] = redirect.split(/[?#]/)
  if (!pathPart) return '/'
  return pathPart.startsWith('/') ? pathPart : `/${pathPart}`
}

function buildUrlWithPath(pathname: string) {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.search)
  if (params.has('redirect')) params.delete('redirect')
  const search = params.toString()
  return `${withBasePath(pathname)}${search ? `?${search}` : ''}${url.hash}`
}

export default function App() {
  const redirectPath = readRedirectPath()
  const [path, setPath] = useState(() =>
    normalizePathname(redirectPath ?? stripBasePath(window.location.pathname)),
  )

  function navigate(href: string, opts?: { replace?: boolean }) {
    const target = withBasePath(href)
    if (target === window.location.pathname && !opts?.replace) return
    if (opts?.replace) window.history.replaceState(null, '', target)
    else window.history.pushState(null, '', target)
    setPath(normalizePathname(href))
  }

  useEffect(() => {
    function onPop() {
      setPath(normalizePathname(stripBasePath(window.location.pathname)))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const normalized = normalizePathname(redirectPath ?? stripBasePath(window.location.pathname))
    const target = buildUrlWithPath(normalized)
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (current !== target) {
      window.history.replaceState(null, '', target)
    }
  }, [redirectPath])

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
