import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../../lib/api'
import {
  createInstagramConnection,
  deleteInstagramConnection,
  listInstagramConnections,
  refreshInstagramConnection,
  resolveInstagramConnection,
  updateInstagramConnection,
} from '../../connections/connectionsApi'
import type { InstagramConnection } from '../../connections/types'

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
      {message}
    </div>
  )
}

export function InstagramConnectionsSection() {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<InstagramConnection[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [createLabel, setCreateLabel] = useState('')
  const [createAccessToken, setCreateAccessToken] = useState('')
  const [createIgUserId, setCreateIgUserId] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIgUserId, setEditIgUserId] = useState('')
  const [editAccessToken, setEditAccessToken] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const editing = useMemo(
    () => connections.find((connection) => connection.id === editingId) ?? null,
    [connections, editingId],
  )

  async function load() {
    setLoading(true)
    setGlobalError(null)
    try {
      setConnections(await listInstagramConnections())
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Failed to load connections'
      setGlobalError(message)
      setConnections([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)

    const label = normalizeOptional(createLabel)
    const accessToken = createAccessToken.trim()
    const igUserId = normalizeOptional(createIgUserId)

    if (!accessToken) {
      setCreateError('Access token is required')
      return
    }

    setCreateBusy(true)
    try {
      await createInstagramConnection({
        ...(label ? { label } : {}),
        accessToken,
        ...(igUserId ? { igUserId } : {}),
      })
      setCreateLabel('')
      setCreateAccessToken('')
      setCreateIgUserId('')
      await load()
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Create failed'
      setCreateError(message)
    } finally {
      setCreateBusy(false)
    }
  }

  function openEdit(connection: InstagramConnection) {
    setEditingId(connection.id)
    setEditLabel(connection.label ?? '')
    setEditIgUserId(connection.igUserId ?? '')
    setEditAccessToken('')
    setEditError(null)
  }

  async function onSaveEdit() {
    if (!editing) return

    const label = editLabel.trim()
    const igUserId = editIgUserId.trim()
    const accessToken = editAccessToken.trim()

    setSavingEdit(true)
    setEditError(null)
    try {
      await updateInstagramConnection(editing.id, {
        label: label ? label : null,
        igUserId: igUserId ? igUserId : null,
        ...(accessToken ? { accessToken } : {}),
      })
      setEditingId(null)
      await load()
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Save failed'
      setEditError(message)
    } finally {
      setSavingEdit(false)
    }
  }

  async function onDelete(connection: InstagramConnection) {
    if (!window.confirm(`Delete connection "${connection.label ?? connection.id}"?`)) {
      return
    }

    setDeletingId(connection.id)
    setGlobalError(null)
    try {
      await deleteInstagramConnection(connection.id)
      await load()
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Delete failed'
      setGlobalError(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function onResolve(connection: InstagramConnection) {
    setResolvingId(connection.id)
    setGlobalError(null)
    try {
      await resolveInstagramConnection(connection.id)
      await load()
    } catch (error: unknown) {
      const message =
        error instanceof ApiError && error.status === 422
          ? 'Unable to resolve IDs for this connection. The token may be missing permissions or not linked to a supported Instagram account.'
          : error instanceof ApiError
            ? `HTTP ${error.status}: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Resolve failed'
      setGlobalError(message)
      await load()
    } finally {
      setResolvingId(null)
    }
  }

  async function onRefresh(connection: InstagramConnection) {
    setRefreshingId(connection.id)
    setGlobalError(null)
    try {
      await refreshInstagramConnection(connection.id)
      await load()
    } catch (error: unknown) {
      const message =
        error instanceof ApiError && error.status === 422
          ? 'Unable to refresh this token. It may be expired, revoked, or missing the required Instagram permissions.'
          : error instanceof ApiError
            ? `HTTP ${error.status}: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Refresh failed'
      setGlobalError(message)
      await load()
    } finally {
      setRefreshingId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Instagram Connections</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-300">
            Slice A stores connections in Supabase under the signed-in user. Raw access tokens are only entered during create or replace and are never shown back in the UI.
          </p>
        </div>

        <button
          type="button"
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>
      </div>

      {globalError ? <InlineError message={globalError} /> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="text-sm font-semibold">Add connection</div>
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
                placeholder="Paste long-lived Instagram token…"
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

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
              Refresh, resolve IDs, and secure server-side token workflows move to Edge Functions in the next slice. This screen already uses Supabase Auth and user-scoped storage.
            </div>

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
            <div className="text-sm font-semibold">Connections</div>
            <div className="text-xs text-zinc-500">{connections.length ? `${connections.length} total` : 'None yet'}</div>
          </div>

          {!connections.length && !loading ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
              Add your first connection to start migrating off the local NAS setup.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            {connections.map((connection) => {
              const isDeleting = deletingId === connection.id
              return (
                <div key={connection.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-50">{connection.label ?? 'Untitled connection'}</div>
                      <div className="mt-1 text-xs text-zinc-500">{connection.id}</div>
                    </div>
                    <div className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                      {connection.connectionStatus}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="text-xs text-zinc-400">Stored token</div>
                      <div className="mt-1 text-zinc-200">{connection.hasStoredAccessToken ? 'Yes' : 'No'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">IG User ID</div>
                      <div className="mt-1 text-zinc-200">{connection.igUserId ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Page ID</div>
                      <div className="mt-1 text-zinc-200">{connection.pageId ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Expires</div>
                      <div className="mt-1 text-zinc-200">{formatDateTime(connection.expiresAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Refresh status</div>
                      <div className="mt-1 text-zinc-200">{connection.refreshStatus ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Updated</div>
                      <div className="mt-1 text-zinc-200">{formatDateTime(connection.updatedAt)}</div>
                    </div>
                  </div>

                  {connection.refreshError ? (
                    <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                      {connection.refreshError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                      onClick={() => void onResolve(connection)}
                      disabled={resolvingId === connection.id || refreshingId === connection.id}
                    >
                      {resolvingId === connection.id ? 'Resolving…' : 'Resolve IDs'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                      onClick={() => void onRefresh(connection)}
                      disabled={refreshingId === connection.id || resolvingId === connection.id}
                    >
                      {refreshingId === connection.id ? 'Refreshing…' : 'Refresh token'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
                      onClick={() => openEdit(connection)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-900/70 bg-zinc-950 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/30 disabled:opacity-60"
                      onClick={() => void onDelete(connection)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingId(null)} />
          <div className="absolute inset-0 flex items-start justify-center p-4 sm:items-center">
            <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div className="text-sm font-semibold">Edit connection</div>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
                  onClick={() => setEditingId(null)}
                >
                  Close
                </button>
              </div>

              <div className="grid gap-3 px-5 py-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
                  Stored tokens are intentionally not displayed. Paste a new one only if you want to replace it.
                </div>

                <label className="grid gap-1">
                  <div className="text-xs text-zinc-400">Label (blank clears)</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 focus:border-zinc-600 focus:outline-none"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    maxLength={120}
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-zinc-400">IG User ID (blank clears)</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 focus:border-zinc-600 focus:outline-none"
                    value={editIgUserId}
                    onChange={(e) => setEditIgUserId(e.target.value)}
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-zinc-400">Replace access token (optional)</div>
                  <textarea
                    className="min-h-20 resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:border-zinc-600 focus:outline-none"
                    value={editAccessToken}
                    onChange={(e) => setEditAccessToken(e.target.value)}
                    placeholder="Paste a new token only if needed…"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                    onClick={() => setEditingId(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                    onClick={() => void onSaveEdit()}
                    disabled={savingEdit}
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>

                {editError ? <InlineError message={editError} /> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
