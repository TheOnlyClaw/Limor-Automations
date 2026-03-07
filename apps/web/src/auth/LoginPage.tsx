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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.24em] text-zinc-400">
          Limor Automations
        </div>
        <div className="mt-5 inline-flex rounded-xl border border-zinc-800 bg-zinc-900/70 p-1 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 transition ${
              mode === 'sign_in' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:text-zinc-50'
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
            className={`rounded-lg px-3 py-1.5 transition ${
              mode === 'sign_up' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:text-zinc-50'
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
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-50">
          {mode === 'sign_in' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">
          {mode === 'sign_in'
            ? 'Use your email and password to access your automations dashboard and connection settings.'
            : 'Create an email/password account for direct access without relying on magic-link emails.'}
        </p>

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1.5">
            <div className="text-xs text-zinc-400">Email</div>
            <input
              type="email"
              className="h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1.5">
            <div className="text-xs text-zinc-400">Password</div>
            <input
              type="password"
              className="h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'sign_in' ? 'Enter your password' : 'Create a password'}
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'sign_up' ? (
            <label className="grid gap-1.5">
              <div className="text-xs text-zinc-400">Confirm password</div>
              <input
                type="password"
                className="h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
            </label>
          ) : null}

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (mode === 'sign_in' ? 'Signing in...' : 'Creating account...') : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {notice ? (
          <div className="mt-4 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
