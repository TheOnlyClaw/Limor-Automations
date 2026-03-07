import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import {
  createInstagramToken,
  deleteInstagramToken,
  type InstagramToken,
  listInstagramTokens,
  patchInstagramToken,
  refreshInstagramToken,
  resolveInstagramTokenIds,
} from '../instagramTokensApi'

type BusyAction =
  | 'refresh'
  | 'resolve'
  | 'delete'
  | 'edit'
  | 'copy'

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function last4(token: string) {
  const s = token.slice(-4)
  return s.length ? s : '----'
}

function maskToken(token: string) {
  return `••••••••${last4(token)}`
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function isNonEmpty(s: string) {
  return s.trim().length > 0
}

function normalizeOptional(s: string): string | undefined {
  const v = s.trim()
  return v.length ? v : undefined
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
      {message}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:items-center">
        <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div className="text-sm font-semibold">{title}</div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function InstagramTokensSection() {
  const [reachable, setReachable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [tokens, setTokens] = useState<InstagramToken[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [createLabel, setCreateLabel] = useState('')
  const [createAccessToken, setCreateAccessToken] = useState('')
  const [createIgUserId, setCreateIgUserId] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)

  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [busyById, setBusyById] = useState<Record<string, BusyAction | undefined>>({})
  const [errorById, setErrorById] = useState<Record<string, string | undefined>>({})
  const [copiedById, setCopiedById] = useState<Record<string, boolean | undefined>>({})
  const copyTimersRef = useRef<Record<string, number>>({})

  const [editing, setEditing] = useState<InstagramToken | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIgUserId, setEditIgUserId] = useState('')
  const [editNewAccessToken, setEditNewAccessToken] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const tokensById = useMemo(() => {
    const m: Record<string, InstagramToken> = {}
    for (const t of tokens) m[t.id] = t
    return m
  }, [tokens])

  async function load() {
    setLoading(true)
    setGlobalError(null)
    try {
      const list = await listInstagramTokens()
      setTokens(list)
      setReachable(true)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setReachable(true)
        setGlobalError(`HTTP ${e.status}: ${e.message}`)
      } else {
        setReachable(false)
        setGlobalError(e instanceof Error ? e.message : 'API not reachable')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timers = copyTimersRef.current
    return () => {
      for (const key of Object.keys(timers)) {
        window.clearTimeout(timers[key])
      }
    }
  }, [])

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)

    const label = normalizeOptional(createLabel)
    const accessToken = createAccessToken.trim()
    const igUserId = normalizeOptional(createIgUserId)

    if (label && label.length > 120) {
      setCreateError('Label must be 120 characters or less')
      return
    }
    if (!isNonEmpty(accessToken)) {
      setCreateError('Access token is required')
      return
    }
    if (createIgUserId.length > 0 && !igUserId) {
      setCreateError('IG User ID cannot be empty')
      return
    }

    setCreateBusy(true)
    try {
      await createInstagramToken({
        ...(label ? { label } : {}),
        accessToken,
        ...(igUserId ? { igUserId } : {}),
      })
      setCreateAccessToken('')
      setCreateError(null)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : (e instanceof Error ? e.message : 'Create failed')
      setCreateError(msg)
    } finally {
      setCreateBusy(false)
    }
  }

  function setBusy(id: string, action: BusyAction | undefined) {
    setBusyById((m) => ({ ...m, [id]: action }))
  }

  function setRowError(id: string, message: string | undefined) {
    setErrorById((m) => ({ ...m, [id]: message }))
  }

  async function onToggleReveal(id: string) {
    setRevealed((m) => ({ ...m, [id]: !m[id] }))
  }

  async function onCopy(token: InstagramToken) {
    const id = token.id
    setRowError(id, undefined)
    setBusy(id, 'copy')
    try {
      await navigator.clipboard.writeText(token.accessToken)
      setCopiedById((m) => ({ ...m, [id]: true }))
      const t = window.setTimeout(() => {
        setCopiedById((m) => ({ ...m, [id]: undefined }))
        delete copyTimersRef.current[id]
      }, 1400)
      copyTimersRef.current[id] = t
    } catch {
      setRowError(id, 'Clipboard copy failed (browser permissions)')
    } finally {
      setBusy(id, undefined)
    }
  }

  async function onRefresh(id: string) {
    setRowError(id, undefined)
    setBusy(id, 'refresh')
    try {
      await refreshInstagramToken(id)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : (e instanceof Error ? e.message : 'Refresh failed')
      setRowError(id, msg)
      await load()
    } finally {
      setBusy(id, undefined)
    }
  }

  async function onResolveIds(id: string) {
    setRowError(id, undefined)
    setBusy(id, 'resolve')
    try {
      await resolveInstagramTokenIds(id)
      await load()
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 422) {
        setRowError(id, 'Unable to resolve IDs (token likely missing permissions / no IG business account)')
      } else {
        const msg = e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : (e instanceof Error ? e.message : 'Resolve IDs failed')
        setRowError(id, msg)
      }
      await load()
    } finally {
      setBusy(id, undefined)
    }
  }

  function openEdit(token: InstagramToken) {
    setEditing(token)
    setEditLabel(token.label ?? '')
    setEditIgUserId(token.igUserId ?? '')
    setEditNewAccessToken('')
    setEditError(null)
  }

  async function onSaveEdit() {
    if (!editing) return
    setEditError(null)
    setBusy(editing.id, 'edit')

    const nextLabelRaw = editLabel.trim()
    const nextIgRaw = editIgUserId.trim()
    const nextNewAccessRaw = editNewAccessToken.trim()

    if (nextLabelRaw.length > 120) {
      setEditError('Label must be 120 characters or less')
      setBusy(editing.id, undefined)
      return
    }

    const patch: { label?: string | null; igUserId?: string | null; accessToken?: string } = {}

    if (nextLabelRaw.length === 0) patch.label = null
    else patch.label = nextLabelRaw

    if (nextIgRaw.length === 0) patch.igUserId = null
    else patch.igUserId = nextIgRaw

    if (editNewAccessToken.length > 0) {
      if (!isNonEmpty(nextNewAccessRaw)) {
        setEditError('New access token cannot be empty')
        setBusy(editing.id, undefined)
        return
      }
      patch.accessToken = nextNewAccessRaw
    }

    try {
      await patchInstagramToken(editing.id, patch)
      setEditing(null)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : (e instanceof Error ? e.message : 'Save failed')
      setEditError(msg)
    } finally {
      setBusy(editing.id, undefined)
    }
  }

  async function onDelete(token: InstagramToken) {
    const ok = window.confirm(
      `Delete token "${token.label ?? token.id}"?\n\nThis can stop existing automations if they rely on this token.`,
    )
    if (!ok) return

    setRowError(token.id, undefined)
    setBusy(token.id, 'delete')
    try {
      await deleteInstagramToken(token.id)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : (e instanceof Error ? e.message : 'Delete failed')
      setRowError(token.id, msg)
    } finally {
      setBusy(token.id, undefined)
    }
  }

  const anyTokens = tokens.length > 0

  if (!reachable) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Instagram Tokens</h1>
            <p className="mt-2 text-sm text-zinc-300">API not reachable. Start the Fastify server and try again.</p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
        {globalError ? <InlineError message={globalError} /> : null}
        <div className="mt-4 text-xs text-zinc-400">
          Dev note: Vite proxies <code className="rounded bg-zinc-900 px-1.5 py-0.5">/api</code> to
          <code className="ml-1 rounded bg-zinc-900 px-1.5 py-0.5">http://localhost:3000</code>.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Instagram Tokens</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Manage Instagram Graph API tokens stored in SQLite. Tokens are masked by default.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>
      </div>

      {globalError ? <InlineError message={globalError} /> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="text-sm font-semibold">Add token</div>
          <form className="mt-4 grid gap-3" onSubmit={onCreateSubmit}>
            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">Label (optional)</div>
              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                maxLength={120}
                placeholder="e.g. Limor main"
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">Access token</div>
              <textarea
                className="min-h-24 resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={createAccessToken}
                onChange={(e) => setCreateAccessToken(e.target.value)}
                placeholder="Paste token…"
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">IG User ID (optional)</div>
              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={createIgUserId}
                onChange={(e) => setCreateIgUserId(e.target.value)}
                placeholder="e.g. 1784…"
                autoComplete="off"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-zinc-500">Never stored in localStorage or URLs.</div>
              <button
                type="submit"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                disabled={createBusy}
              >
                {createBusy ? 'Saving…' : 'Create'}
              </button>
            </div>
            {createError ? <InlineError message={createError} /> : null}
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Tokens</div>
            <div className="text-xs text-zinc-500">{anyTokens ? `${tokens.length} total` : 'None yet'}</div>
          </div>

          {!anyTokens && !loading ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
              Add your first token to get started.
            </div>
          ) : null}

          {loading && !anyTokens ? (
            <div className="mt-4 text-sm text-zinc-400">Loading…</div>
          ) : null}

          {anyTokens ? (
            <div className="mt-4">
              <div className="hidden md:block">
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full min-w-[980px] table-auto">
                    <thead className="bg-zinc-950">
                      <tr className="text-left text-xs text-zinc-400">
                        <th className="px-3 py-2 font-medium">Label</th>
                        <th className="px-3 py-2 font-medium">Access token</th>
                        <th className="px-3 py-2 font-medium">IG User ID</th>
                        <th className="px-3 py-2 font-medium">Expires</th>
                        <th className="px-3 py-2 font-medium">Refresh</th>
                        <th className="px-3 py-2 font-medium">Updated</th>
                        <th className="px-3 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {tokens.map((t) => {
                        const isRevealed = Boolean(revealed[t.id])
                        const busy = busyById[t.id]
                        const rowErr = errorById[t.id]
                        const copied = Boolean(copiedById[t.id])
                        return (
                          <tr key={t.id} className={clsx('align-top', rowErr && 'bg-red-950/10')}>
                            <td className="px-3 py-3 text-sm">
                              <div className="font-medium text-zinc-50">{t.label ?? '—'}</div>
                              <div className="mt-1 text-xs text-zinc-500">{t.id}</div>
                              <div className="mt-1 text-xs text-zinc-500" title={t.createdAt}>
                                Created {formatDateTime(t.createdAt)}
                              </div>
                              {rowErr ? <div className="mt-2 text-xs text-red-200">{rowErr}</div> : null}
                            </td>
                            <td className="px-3 py-3 text-sm">
                              <div className={clsx('font-mono text-xs', isRevealed ? 'text-zinc-100 break-all' : 'text-zinc-300')}>
                                {isRevealed ? t.accessToken : maskToken(t.accessToken)}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                  onClick={() => void onToggleReveal(t.id)}
                                  disabled={Boolean(busy)}
                                >
                                  {isRevealed ? 'Hide' : 'Reveal'}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                  onClick={() => void onCopy(t)}
                                  disabled={Boolean(busy)}
                                >
                                  {copied ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm text-zinc-200">{t.igUserId ?? '—'}</td>
                            <td className="px-3 py-3 text-xs text-zinc-300" title={t.expiresAt ?? ''}>
                              {formatDateTime(t.expiresAt)}
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <div className="text-zinc-200">{t.refreshStatus ?? '—'}</div>
                              <div className="mt-1 text-zinc-500" title={t.lastRefreshedAt ?? ''}>
                                {t.lastRefreshedAt ? `Last: ${formatDateTime(t.lastRefreshedAt)}` : 'Last: —'}
                              </div>
                              {t.refreshError ? (
                                <div className="mt-1 max-w-[260px] break-words text-red-200" title={t.refreshError}>
                                  {t.refreshError}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-xs text-zinc-400" title={t.updatedAt}>
                              {formatDateTime(t.updatedAt)}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                                  onClick={() => void onRefresh(t.id)}
                                  disabled={Boolean(busy)}
                                >
                                  {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                  onClick={() => void onResolveIds(t.id)}
                                  disabled={Boolean(busy)}
                                >
                                  {busy === 'resolve' ? 'Resolving…' : 'Resolve IDs'}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                  onClick={() => openEdit(t)}
                                  disabled={Boolean(busy)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-red-900/70 bg-zinc-950 px-2.5 py-1 text-xs text-red-200 hover:bg-red-950/30 disabled:opacity-60"
                                  onClick={() => void onDelete(t)}
                                  disabled={Boolean(busy)}
                                >
                                  {busy === 'delete' ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 md:hidden">
                {tokens.map((t) => {
                  const isRevealed = Boolean(revealed[t.id])
                  const busy = busyById[t.id]
                  const rowErr = errorById[t.id]
                  const copied = Boolean(copiedById[t.id])
                  return (
                    <div key={t.id} className={clsx('rounded-2xl border border-zinc-800 bg-zinc-950 p-4', rowErr && 'border-red-900/60')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{t.label ?? '—'}</div>
                          <div className="mt-1 text-xs text-zinc-500">{t.id}</div>
                          <div className="mt-1 text-xs text-zinc-500" title={t.createdAt}>Created {formatDateTime(t.createdAt)}</div>
                        </div>
                        <div className="text-xs text-zinc-500" title={t.updatedAt}>Updated {formatDateTime(t.updatedAt)}</div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm">
                        <div>
                          <div className="text-xs text-zinc-400">Access token</div>
                          <div className={clsx('mt-1 font-mono text-xs', isRevealed ? 'text-zinc-100 break-all' : 'text-zinc-300')}>
                            {isRevealed ? t.accessToken : maskToken(t.accessToken)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                              onClick={() => void onToggleReveal(t.id)}
                              disabled={Boolean(busy)}
                            >
                              {isRevealed ? 'Hide' : 'Reveal'}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                              onClick={() => void onCopy(t)}
                              disabled={Boolean(busy)}
                            >
                              {copied ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-zinc-400">IG User ID</div>
                            <div className="mt-1 text-sm text-zinc-200">{t.igUserId ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-400">Expires</div>
                            <div className="mt-1 text-xs text-zinc-300" title={t.expiresAt ?? ''}>
                              {formatDateTime(t.expiresAt)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-zinc-400">Refresh</div>
                          <div className="mt-1 text-sm text-zinc-200">{t.refreshStatus ?? '—'}</div>
                          <div className="mt-1 text-xs text-zinc-500" title={t.lastRefreshedAt ?? ''}>
                            {t.lastRefreshedAt ? `Last: ${formatDateTime(t.lastRefreshedAt)}` : 'Last: —'}
                          </div>
                          {t.refreshError ? (
                            <div className="mt-1 break-words text-xs text-red-200" title={t.refreshError}>
                              {t.refreshError}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {rowErr ? <div className="mt-3 text-xs text-red-200">{rowErr}</div> : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                          onClick={() => void onRefresh(t.id)}
                          disabled={Boolean(busy)}
                        >
                          {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                          onClick={() => void onResolveIds(t.id)}
                          disabled={Boolean(busy)}
                        >
                          {busy === 'resolve' ? 'Resolving…' : 'Resolve IDs'}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                          onClick={() => openEdit(t)}
                          disabled={Boolean(busy)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-900/70 bg-zinc-950 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/30 disabled:opacity-60"
                          onClick={() => void onDelete(t)}
                          disabled={Boolean(busy)}
                        >
                          {busy === 'delete' ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-semibold">Danger zone</div>
        <div className="mt-1 text-sm text-zinc-300">
          Deleting a token can stop existing automations if they rely on it.
        </div>
      </div>

      {editing ? (
        <Modal title="Edit token" onClose={() => setEditing(null)}>
          <div className="grid gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Current token</div>
              <div className="mt-1 font-mono text-xs text-zinc-200">{maskToken(editing.accessToken)}</div>
            </div>

            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">Label (blank clears)</div>
              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">IG User ID (blank clears)</div>
              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={editIgUserId}
                onChange={(e) => setEditIgUserId(e.target.value)}
                autoComplete="off"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-xs text-zinc-400">Replace access token (optional)</div>
              <textarea
                className="min-h-20 resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                value={editNewAccessToken}
                onChange={(e) => setEditNewAccessToken(e.target.value)}
                placeholder="Paste new token to replace…"
                autoComplete="off"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                onClick={() => setEditing(null)}
                disabled={busyById[editing.id] === 'edit'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                onClick={() => void onSaveEdit()}
                disabled={busyById[editing.id] === 'edit'}
              >
                {busyById[editing.id] === 'edit' ? 'Saving…' : 'Save'}
              </button>
            </div>

            {editError ? <InlineError message={editError} /> : null}

            <div className="text-xs text-zinc-500">
              Created {formatDateTime(tokensById[editing.id]?.createdAt ?? editing.createdAt)} · Updated{' '}
              {formatDateTime(tokensById[editing.id]?.updatedAt ?? editing.updatedAt)}
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
