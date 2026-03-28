import { useState } from 'react'
import { ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'

type AuthMode = 'sign_in' | 'sign_up'

const basePath = import.meta.env.BASE_URL ?? '/'
const basePrefix = basePath === '/' ? '' : basePath.replace(/\/+$/g, '')

function withBasePath(pathname: string) {
  if (!basePrefix) return pathname
  if (pathname === '/') return `${basePrefix}/`
  if (pathname.startsWith(`${basePrefix}/`)) return pathname
  return `${basePrefix}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

function goToDashboard() {
  window.history.replaceState(null, '', withBasePath('/dashboard'))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const nextEmail = email.trim()
    if (!nextEmail) {
      setError('Email is required')
      return
    }

    if (!password) {
      setError('Password is required')
      return
    }

    if (mode === 'sign_up') {
      if (!confirmPassword) {
        setError('Please confirm your password')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'sign_in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: nextEmail,
          password,
        })

        if (signInError) throw signInError

        goToDashboard()
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: nextEmail,
        password,
      })

      if (signUpError) throw signUpError

      if (data.session) {
        goToDashboard()
        return
      }

      setNotice(
        'Account created. If email confirmation is enabled in Supabase Auth, confirm your email before signing in.',
      )
      setMode('sign_in')
      setPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : mode === 'sign_in'
              ? 'Unable to sign in'
              : 'Unable to create account'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.18),transparent_55%)]" />
      <div className="absolute right-0 top-24 h-72 w-72 rounded-full bg-pink-500/10 blur-3xl" />
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,420px)]">
        <section className="hidden rounded-[32px] border border-white/10 bg-zinc-950/60 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:block">
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100/80">
            Limor Automations
          </div>
          <h1 className="mt-8 max-w-lg text-4xl font-semibold tracking-tight text-zinc-50">
            Calm control for Instagram replies, DMs, and connection health.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
            Review recent posts, keep automations reliable, and manage sensitive tokens in one quiet workspace built for repeat operational use.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Monitor</div>
              <div className="mt-2 text-sm text-zinc-200">See post activity, connection status, and failures at a glance.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Configure</div>
              <div className="mt-2 text-sm text-zinc-200">Adjust rules and messages without exposing token details in the UI.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Recover</div>
              <div className="mt-2 text-sm text-zinc-200">Refresh connections and retry failed work before anything drifts.</div>
            </div>
          </div>
        </section>

        <div className="relative w-full rounded-[32px] border border-white/10 bg-zinc-950/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.24em] text-zinc-400">
            Secure workspace
          </div>
          <div className="mt-5 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1 text-sm">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 transition ${
                mode === 'sign_in'
                  ? 'bg-gradient-to-r from-amber-300 to-orange-300 text-zinc-950 shadow-lg shadow-amber-500/20'
                  : 'text-zinc-300 hover:text-zinc-50'
              }`}
              onClick={() => {
                setMode('sign_in')
                setError(null)
                setNotice(null)
                setPassword('')
                setConfirmPassword('')
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 transition ${
                mode === 'sign_up'
                  ? 'bg-gradient-to-r from-amber-300 to-orange-300 text-zinc-950 shadow-lg shadow-amber-500/20'
                  : 'text-zinc-300 hover:text-zinc-50'
              }`}
              onClick={() => {
                setMode('sign_up')
                setError(null)
                setNotice(null)
                setPassword('')
                setConfirmPassword('')
              }}
            >
              Create account
            </button>
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-50">
            {mode === 'sign_in' ? 'Welcome back' : 'Create your workspace access'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {mode === 'sign_in'
              ? 'Use your email and password to access the dashboard and connection controls.'
              : 'Create an email/password account for direct access without relying on magic-link emails.'}
          </p>

          <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
            <label className="grid gap-1.5">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Email</div>
              <input
                type="email"
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-300/40 focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label className="grid gap-1.5">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Password</div>
              <input
                type="password"
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-300/40 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'sign_in' ? 'Enter your password' : 'Create a password'}
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'sign_up' ? (
              <label className="grid gap-1.5">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Confirm password</div>
                <input
                  type="password"
                  className="h-12 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-300/40 focus:outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
              </label>
            ) : null}

            <button
              type="submit"
              className="mt-2 rounded-2xl bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:brightness-105 disabled:opacity-60"
              disabled={loading}
            >
              {loading
                ? mode === 'sign_in'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'sign_in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
