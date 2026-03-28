import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../lib/api'
import { listInstagramConnections } from '../connections/connectionsApi'
import type { InstagramConnection } from '../connections/types'
import { listInstagramPosts, type InstagramPost } from './instagramPostsApi'
import {
  listFailedExecutions,
  retryFailedExecution,
  type FailedExecution,
} from './failedExecutionsApi'
import {
  createPostAutomation,
  listPostAutomations,
  patchPostAutomation,
  type PostAutomation,
} from './automationsApi'
import { AutomationDialog } from './AutomationDialog'
import { FailedExecutionsDialog } from './FailedExecutionsDialog'
import {
  automationToDraftFields,
  draftToRulesActions,
  type AutomationDraft,
} from './automationDraft'

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
      {message}
    </div>
  )
}

function connectionLabel(connection: InstagramConnection) {
  if (connection.label && connection.label.trim().length) return connection.label
  return connection.id
}

function mediaPreviewUrl(p: InstagramPost): string | null {
  return p.thumbnailUrl ?? p.mediaUrl ?? null
}

function automationStatus(automation?: PostAutomation): 'active' | 'needs_message' | 'disabled' | 'off' {
  const hasRules = Boolean(automation?.rules && automation.rules.length > 0)
  const hasActions = Boolean(automation?.actions && automation.actions.length > 0)

  if (!automation) return 'off'
  if (automation.enabled && hasRules && hasActions) return 'active'
  if (automation.enabled) return 'needs_message'
  if (hasRules || hasActions) return 'disabled'
  return 'off'
}

function automationStatusLabel(status: ReturnType<typeof automationStatus>) {
  if (status === 'active') return 'Active'
  if (status === 'needs_message') return 'Needs message'
  if (status === 'disabled') return 'Disabled'
  return 'Not listening'
}

function automationStatusClassName(status: ReturnType<typeof automationStatus>) {
  if (status === 'active') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
  if (status === 'needs_message') return 'border-amber-400/20 bg-amber-500/10 text-amber-100'
  if (status === 'disabled') return 'border-white/10 bg-white/[0.04] text-zinc-200'
  return 'border-white/10 bg-white/[0.03] text-zinc-400'
}

type ListenerDraft = AutomationDraft

export function DashboardPage({
  onGoToSettings,
}: {
  onGoToSettings: () => void
}) {
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [connections, setConnections] = useState<InstagramConnection[]>([])
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const [connectionId, setConnectionId] = useState<string>('')

  const [loadingPosts, setLoadingPosts] = useState(false)
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [postsError, setPostsError] = useState<string | null>(null)

  const [loadingAutomations, setLoadingAutomations] = useState(false)
  const [automationsError, setAutomationsError] = useState<string | null>(null)
  const [automationByPostId, setAutomationByPostId] = useState<Record<string, PostAutomation | undefined>>({})
  const [listenerDraftsByPostId, setListenerDraftsByPostId] = useState<Record<string, ListenerDraft | undefined>>({})
  const [configPostId, setConfigPostId] = useState<string | null>(null)

  const [failedExecutionsByPostId, setFailedExecutionsByPostId] = useState<Record<string, FailedExecution[]>>({})
  const [failedExecutionsLoadingByPostId, setFailedExecutionsLoadingByPostId] = useState<Record<string, boolean>>({})
  const [failedExecutionsErrorByPostId, setFailedExecutionsErrorByPostId] = useState<Record<string, string | null>>({})
  const [failedExecutionsLoadedByPostId, setFailedExecutionsLoadedByPostId] = useState<Record<string, boolean>>({})
  const [failedExecutionsPostId, setFailedExecutionsPostId] = useState<string | null>(null)
  const [failedExecutionsRetryState, setFailedExecutionsRetryState] = useState<Record<string, 'idle' | 'retrying' | 'failed'>>({})

  const connectionById = useMemo(() => {
    const m: Record<string, InstagramConnection> = {}
    for (const connection of connections) m[connection.id] = connection
    return m
  }, [connections])

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true)
    setConnectionError(null)
    try {
      const list = await listInstagramConnections()
      setConnections(list)
      return list
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? `HTTP ${e.status}: ${e.message}`
          : (e instanceof Error ? e.message : 'Failed to load connections')
      setConnectionError(msg)
      setConnections([])
      return [] as InstagramConnection[]
    } finally {
      setLoadingConnections(false)
    }
  }, [])

  const loadPosts = useCallback(async (nextConnectionId: string) => {
    setLoadingPosts(true)
    setPostsError(null)
    try {
      const res = await listInstagramPosts({ connectionId: nextConnectionId, limit: 30 })
      setPosts(res.items)
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? `HTTP ${e.status}: ${e.message}`
          : (e instanceof Error ? e.message : 'Failed to load posts')
      setPostsError(msg)
      setPosts([])
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  const loadAutomations = useCallback(async (nextConnectionId: string) => {
    setLoadingAutomations(true)
    setAutomationsError(null)
    try {
      const list = await listPostAutomations({ connectionId: nextConnectionId })
      const next: Record<string, PostAutomation | undefined> = {}
      for (const a of list) next[a.igPostId] = a
      setAutomationByPostId(next)
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? `HTTP ${e.status}: ${e.message}`
          : (e instanceof Error ? e.message : 'Failed to load automations')
      setAutomationsError(msg)
      setAutomationByPostId({})
    } finally {
      setLoadingAutomations(false)
    }
  }, [])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  useEffect(() => {
    if (connections.length === 0) {
      if (connectionId) setConnectionId('')
      return
    }

    if (connectionId && connectionById[connectionId]) return
    setConnectionId(connections[0].id)
  }, [connectionById, connectionId, connections])

  useEffect(() => {
    if (!connectionId) return
    void loadPosts(connectionId)
    void loadAutomations(connectionId)
    setListenerDraftsByPostId({})
    setConfigPostId(null)
    setFailedExecutionsByPostId({})
    setFailedExecutionsLoadingByPostId({})
    setFailedExecutionsErrorByPostId({})
    setFailedExecutionsLoadedByPostId({})
    setFailedExecutionsPostId(null)
    setFailedExecutionsRetryState({})
  }, [connectionId, loadAutomations, loadPosts])

  useEffect(() => {
    if (!posts.length) return
    setListenerDraftsByPostId((prev) => {
      const next: Record<string, ListenerDraft | undefined> = { ...prev }
      for (const p of posts) {
        const existing = prev[p.id]
        const a = automationByPostId[p.id]
        if (!existing) {
            const base = automationToDraftFields(a)
            next[p.id] = {
              automationId: a?.id ?? null,
              enabled: base.enabled,
              pattern: base.pattern,
              flags: base.flags,
              replyEnabled: base.replyEnabled,
              replyTemplates: base.replyTemplates,
              replyUseAi: base.replyUseAi,
              dmEnabled: base.dmEnabled,
              dmTemplates: base.dmTemplates,
              dmMediaKind: base.dmMediaKind,
              dmMediaBucket: base.dmMediaBucket,
              dmMediaPath: base.dmMediaPath,
              dmImageEnabled: base.dmImageEnabled,
              dmCtaText: base.dmCtaText,
              dmCtaGreeting: base.dmCtaGreeting,
              dmCtaEnabled: base.dmCtaEnabled,
              dirty: false,
              saving: false,
              error: null,
            }
          continue
        }

        if (!existing.automationId && a?.id) {
          next[p.id] = {
            ...existing,
            automationId: a.id,
          }
        }

        // Keep local draft in sync with backend unless the user has edits.
        if (!existing.dirty && !existing.saving) {
          const base = automationToDraftFields(a)
          next[p.id] = {
            ...existing,
            automationId: a?.id ?? null,
            enabled: base.enabled,
            pattern: base.pattern,
            flags: base.flags,
            replyEnabled: base.replyEnabled,
            replyTemplates: base.replyTemplates,
            replyUseAi: base.replyUseAi,
            dmEnabled: base.dmEnabled,
            dmTemplates: base.dmTemplates,
            dmMediaKind: base.dmMediaKind,
            dmMediaBucket: base.dmMediaBucket,
            dmMediaPath: base.dmMediaPath,
            dmImageEnabled: base.dmImageEnabled,
            dmCtaText: base.dmCtaText,
            dmCtaGreeting: base.dmCtaGreeting,
            dmCtaEnabled: base.dmCtaEnabled,
            error: null,
          }
        }
      }
      return next
    })
  }, [automationByPostId, posts])

  const loadFailedExecutions = useCallback(async (postId: string) => {
    setFailedExecutionsLoadingByPostId((prev) => ({ ...prev, [postId]: true }))
    setFailedExecutionsErrorByPostId((prev) => ({ ...prev, [postId]: null }))

    try {
      const res = await listFailedExecutions({ postId })
      setFailedExecutionsByPostId((prev) => ({ ...prev, [postId]: res.items }))
      setFailedExecutionsLoadedByPostId((prev) => ({ ...prev, [postId]: true }))
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? `HTTP ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unable to load failed executions'
      setFailedExecutionsErrorByPostId((prev) => ({ ...prev, [postId]: msg }))
      setFailedExecutionsByPostId((prev) => ({ ...prev, [postId]: [] }))
      setFailedExecutionsLoadedByPostId((prev) => ({ ...prev, [postId]: true }))
    } finally {
      setFailedExecutionsLoadingByPostId((prev) => ({ ...prev, [postId]: false }))
    }
  }, [])

  const loadFailedExecutionsForPosts = useCallback(async (items: InstagramPost[]) => {
    const pending = items.filter((item) => !failedExecutionsLoadedByPostId[item.id])
    if (pending.length === 0) return

    setFailedExecutionsLoadingByPostId((prev) => {
      const next = { ...prev }
      for (const item of pending) next[item.id] = true
      return next
    })

    setFailedExecutionsErrorByPostId((prev) => {
      const next = { ...prev }
      for (const item of pending) next[item.id] = null
      return next
    })

    const results = await Promise.allSettled(
      pending.map((item) => listFailedExecutions({ postId: item.id })),
    )

    setFailedExecutionsByPostId((prev) => {
      const next = { ...prev }
      results.forEach((result, index) => {
        const postId = pending[index].id
        if (result.status === 'fulfilled') {
          next[postId] = result.value.items
        } else {
          next[postId] = []
        }
      })
      return next
    })

    setFailedExecutionsErrorByPostId((prev) => {
      const next = { ...prev }
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const reason = result.reason
          const msg =
            reason instanceof ApiError
              ? `HTTP ${reason.status}: ${reason.message}`
              : reason instanceof Error
                ? reason.message
                : 'Unable to load failed executions'
          next[pending[index].id] = msg
        }
      })
      return next
    })

    setFailedExecutionsLoadedByPostId((prev) => {
      const next = { ...prev }
      for (const item of pending) next[item.id] = true
      return next
    })

    setFailedExecutionsLoadingByPostId((prev) => {
      const next = { ...prev }
      for (const item of pending) next[item.id] = false
      return next
    })
  }, [failedExecutionsLoadedByPostId])

  const activeConnection = connectionId ? connectionById[connectionId] : null

  const postStats = useMemo(() => {
    let active = 0
    let needsAttention = 0
    let failed = 0

    for (const post of posts) {
      const status = automationStatus(automationByPostId[post.id])
      if (status === 'active') active += 1
      if (status === 'needs_message' || (failedExecutionsByPostId[post.id]?.length ?? 0) > 0) {
        needsAttention += 1
      }
      failed += failedExecutionsByPostId[post.id]?.length ?? 0
    }

    return {
      totalPosts: posts.length,
      active,
      needsAttention,
      failed,
    }
  }, [automationByPostId, failedExecutionsByPostId, posts])

  useEffect(() => {
    if (!connectionId || posts.length === 0) return
    void loadFailedExecutionsForPosts(posts)
  }, [connectionId, loadFailedExecutionsForPosts, posts])

  const onRetryFailedExecution = useCallback(async (postId: string, executionId: string) => {
    setFailedExecutionsRetryState((prev) => ({ ...prev, [executionId]: 'retrying' }))
    try {
      const res = await retryFailedExecution({ executionId })
      if (res.status === 'succeeded') {
        setFailedExecutionsByPostId((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? []).filter((item) => item.id !== executionId),
        }))
        setFailedExecutionsRetryState((prev) => ({ ...prev, [executionId]: 'idle' }))
        return
      }

      setFailedExecutionsRetryState((prev) => ({ ...prev, [executionId]: 'failed' }))
    } catch (error) {
      setFailedExecutionsRetryState((prev) => ({ ...prev, [executionId]: 'failed' }))
      const msg =
        error instanceof ApiError
          ? `HTTP ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Retry failed'
      setFailedExecutionsErrorByPostId((prev) => ({ ...prev, [postId]: msg }))
    }
  }, [])

  async function onSaveListener(postId: string) {
    if (!connectionId) return
    const draft = listenerDraftsByPostId[postId]
    if (!draft) return

    if (draft.enabled && !draft.pattern.trim()) {
      setListenerDraftsByPostId((m) => ({
        ...m,
        [postId]: m[postId]
          ? { ...m[postId]!, error: 'Pattern is required when listening' }
          : m[postId],
      }))
      return
    }

    if (draft.replyEnabled) {
      const replyMessages = draft.replyTemplates.map((template) => template.trim())
      if (replyMessages.length === 0 || replyMessages.every((message) => !message)) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'Reply message is enabled but empty' }
            : m[postId],
        }))
        return
      }

      if (replyMessages.some((message) => !message)) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'Fill or remove empty reply tabs' }
            : m[postId],
        }))
        return
      }
    }

    if (draft.dmEnabled) {
      const dmMessages = draft.dmTemplates.map((template) => template.trim())
      if (dmMessages.length === 0 || dmMessages.every((message) => !message)) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'DM message is enabled but empty' }
            : m[postId],
        }))
        return
      }

      if (dmMessages.some((message) => !message)) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'Fill or remove empty DM tabs' }
            : m[postId],
        }))
        return
      }

      if (dmMessages.some((message) => message.length > 999)) {
        setListenerDraftsByPostId((m) => ({
          ...m,
            [postId]: m[postId]
              ? { ...m[postId]!, error: 'DM message exceeds 999 characters' }
              : m[postId],
        }))
        return
      }

      if ((dmMessages.length > 1 || draft.dmCtaEnabled) && !draft.dmCtaGreeting.trim()) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'CTA greeting message is required' }
            : m[postId],
        }))
        return
      }

      if ((dmMessages.length > 1 || draft.dmCtaEnabled) && !draft.dmCtaText.trim()) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'CTA button text is required' }
            : m[postId],
        }))
        return
      }

      if (draft.dmCtaText.trim().length > 20) {
        setListenerDraftsByPostId((m) => ({
          ...m,
          [postId]: m[postId]
            ? { ...m[postId]!, error: 'CTA text must be 20 characters or less' }
            : m[postId],
        }))
        return
      }
    }

    const { rules, actions } = draftToRulesActions(draft)

    if (!draft.automationId && !draft.enabled && rules.length === 0 && actions.length === 0) {
      setListenerDraftsByPostId((m) => ({
        ...m,
        [postId]: m[postId]
          ? {
              ...m[postId]!,
              dirty: false,
              saving: false,
              error: null,
            }
          : m[postId],
      }))
      return
    }

    setListenerDraftsByPostId((m) => ({
      ...m,
      [postId]: m[postId] ? { ...m[postId]!, saving: true, error: null } : m[postId],
    }))

    try {
      let res: PostAutomation | null = null
      const existingAutomationId = draft.automationId ?? automationByPostId[postId]?.id ?? null
      const payload = {
        enabled: draft.enabled,
        dmCtaText: draft.dmCtaText.trim() || null,
        dmCtaGreeting: draft.dmCtaGreeting.trim() || null,
        dmCtaEnabled: draft.dmCtaEnabled,
        rules,
        actions,
      }

      if (existingAutomationId) {
        res = await patchPostAutomation(existingAutomationId, payload)
      } else {
        try {
          res = await createPostAutomation({
            connectionId,
            igPostId: postId,
            ...payload,
          })
        } catch (error) {
          const isDuplicate =
            error instanceof ApiError &&
            error.message.toLowerCase().includes('automation already exists')

          if (!isDuplicate) throw error

          const existing = await listPostAutomations({ connectionId, igPostId: postId })
          const fallback = existing[0]
          if (!fallback) throw error

          res = await patchPostAutomation(fallback.id, payload)
        }
      }

      if (res) {
        setAutomationByPostId((m) => ({ ...m, [postId]: res ?? undefined }))
      }

      setListenerDraftsByPostId((m) => ({
        ...m,
        [postId]: m[postId]
          ? {
              ...m[postId]!,
              automationId: res?.id ?? m[postId]!.automationId,
              dirty: false,
              saving: false,
              error: null,
            }
          : m[postId],
      }))
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? `HTTP ${e.status}: ${e.message}`
          : (e instanceof Error ? e.message : 'Save failed')
      setListenerDraftsByPostId((m) => ({
        ...m,
        [postId]: m[postId]
          ? {
              ...m[postId]!,
              saving: false,
              error: msg,
            }
          : m[postId],
      }))
    }
  }

  return (
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-100/80">
            Automation overview
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
            Review the latest 30 Instagram posts for the selected connection, then open any post to adjust its replies and DM flow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.07] disabled:opacity-60"
            onClick={() => void loadConnections()}
            disabled={loadingConnections}
          >
            {loadingConnections ? 'Refreshing…' : 'Refresh connections'}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.07] disabled:opacity-60"
            onClick={() => (connectionId ? void loadAutomations(connectionId) : undefined)}
            disabled={!connectionId || loadingAutomations}
          >
            {loadingAutomations ? 'Loading…' : 'Refresh automations'}
          </button>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:brightness-105 disabled:opacity-60"
            onClick={() => (connectionId ? void loadPosts(connectionId) : undefined)}
            disabled={!connectionId || loadingPosts}
          >
            {loadingPosts ? 'Loading…' : 'Refresh posts'}
          </button>
        </div>
      </div>

      {connectionError ? <InlineError message={connectionError} /> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Selected connection</div>
          <div className="mt-2 text-lg font-semibold text-zinc-50">{activeConnection ? connectionLabel(activeConnection) : 'None selected'}</div>
          <div className="mt-1 text-sm text-zinc-400">{activeConnection?.igUserId ? `IG User ID ${activeConnection.igUserId}` : 'Choose a connection to fetch posts.'}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Posts loaded</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{postStats.totalPosts}</div>
          <div className="mt-1 text-sm text-zinc-400">Latest feed items currently available in the dashboard.</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-100/70">Active automations</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-emerald-50">{postStats.active}</div>
          <div className="mt-1 text-sm text-emerald-100/80">Posts already listening with rules and actions in place.</div>
        </div>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-100/70">Needs attention</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-amber-50">{postStats.needsAttention}</div>
          <div className="mt-1 text-sm text-amber-100/80">Includes draft issues and {postStats.failed} failed execution{postStats.failed === 1 ? '' : 's'}.</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-[26px] border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid gap-1">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Connection</div>
          <select
            className="h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/80 px-4 text-sm text-zinc-50 focus:border-amber-300/40 focus:outline-none sm:min-w-[320px]"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            disabled={loadingConnections || connections.length === 0}
          >
            {connections.length === 0 ? <option value="">No connections available</option> : null}
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connectionLabel(connection)}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
          {activeConnection ? (
            <span>
              IG User ID: <span className="text-zinc-200">{activeConnection.igUserId ?? '—'}</span>
            </span>
          ) : (
            <span>Select a connection to load posts.</span>
          )}
        </div>
      </div>

      {connections.length === 0 && !loadingConnections ? (
        <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
          <div className="font-medium text-zinc-50">No connections yet</div>
          <div className="mt-1 leading-6">Add an Instagram connection in Settings to fetch posts.</div>
          <div className="mt-3">
            <button
              type="button"
              className="rounded-2xl bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:brightness-105"
              onClick={onGoToSettings}
            >
              Go to Settings
            </button>
          </div>
        </div>
      ) : null}

      {postsError ? <InlineError message={postsError} /> : null}
      {automationsError ? <InlineError message={automationsError} /> : null}

      {connectionId && !loadingPosts && posts.length === 0 && !postsError ? (
        <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
          No posts returned for this connection.
        </div>
      ) : null}

      {loadingPosts && connectionId ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] p-3">
              <div className="aspect-square rounded-2xl bg-white/[0.05]" />
              <div className="mt-3 h-4 w-2/5 rounded-full bg-white/[0.05]" />
              <div className="mt-2 h-3 w-full rounded-full bg-white/[0.05]" />
              <div className="mt-2 h-3 w-4/5 rounded-full bg-white/[0.05]" />
            </div>
          ))}
        </div>
      ) : null}

      {posts.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {posts.map((p) => {
            const preview = mediaPreviewUrl(p)
            const a = automationByPostId[p.id]
            const status = automationStatus(a)
            const failedCount = failedExecutionsByPostId[p.id]?.length ?? 0
            return (
              <div
                key={p.id}
                className="group overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-amber-300/20 hover:bg-white/[0.05]"
              >
                <a
                  href={p.permalink ?? '#'}
                  target={p.permalink ? '_blank' : undefined}
                  rel={p.permalink ? 'noreferrer' : undefined}
                  className="block"
                  onClick={(e) => {
                    if (!p.permalink) e.preventDefault()
                  }}
                >
                  <div className="aspect-square w-full bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900">
                    {preview ? (
                      <img
                        src={preview}
                        alt={p.caption ? p.caption : 'Instagram post'}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                </a>

                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-full border border-white/10 bg-zinc-950/80 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300">
                      {p.mediaType}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-zinc-500" title={p.timestamp ?? ''}>
                        {formatDateTime(p.timestamp)}
                      </div>
                      {p.permalink ? (
                        <a
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-300 transition hover:text-amber-100"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${automationStatusClassName(status)}`}
                      title={a?.rules?.[0]?.pattern ?? ''}
                    >
                      {automationStatusLabel(status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="relative flex h-7 w-7 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-[12px] font-semibold text-red-100 transition hover:bg-red-500/20"
                        onClick={() => {
                          setFailedExecutionsPostId(p.id)
                          void loadFailedExecutions(p.id)
                        }}
                        title={failedCount > 0 ? `${failedCount} failed executions` : 'Failed executions'}
                        aria-label={failedCount > 0 ? `${failedCount} failed executions` : 'Failed executions'}
                      >
                        !
                        {failedCount > 0 ? (
                          <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-red-600 px-1 text-[9px] text-white">
                            {failedCount}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                        onClick={() => {
                          setConfigPostId(p.id)
                        }}
                      >
                        Configure
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 truncate text-xs leading-5 text-zinc-300" title={p.caption ?? ''}>
                    {p.caption ?? '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <AutomationDialog
        key={configPostId ?? 'automation-dialog'}
        open={Boolean(configPostId && listenerDraftsByPostId[configPostId])}
        post={configPostId ? posts.find((p) => p.id === configPostId) ?? null : null}
        automation={configPostId ? automationByPostId[configPostId] : undefined}
        draft={configPostId ? listenerDraftsByPostId[configPostId] : undefined}
        onClose={() => setConfigPostId(null)}
        onToggleEnabled={(enabled) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  enabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangePattern={(pattern) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  pattern,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangeFlags={(flags) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  flags,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onToggleReply={(replyEnabled) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  replyEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onToggleReplyUseAi={(replyUseAi) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  replyUseAi,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangeReplyTemplate={(index, replyTemplate) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  replyTemplates: m[configPostId]!.replyTemplates.map((template, i) =>
                    i === index ? replyTemplate : template,
                  ),
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onAddReplyTemplate={() => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  replyTemplates: [...m[configPostId]!.replyTemplates, ''],
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onRemoveReplyTemplate={(index) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  replyTemplates:
                    m[configPostId]!.replyTemplates.length > 1
                      ? m[configPostId]!.replyTemplates.filter((_, i) => i !== index)
                      : [''],
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onToggleDm={(dmEnabled) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmEnabled,
                  dmCtaText: dmEnabled ? m[configPostId]!.dmCtaText : '',
                  dmCtaGreeting: dmEnabled ? m[configPostId]!.dmCtaGreeting : '',
                  dmCtaEnabled: dmEnabled ? m[configPostId]!.dmCtaEnabled : false,
                  dmMediaKind: dmEnabled ? m[configPostId]!.dmMediaKind : null,
                  dmMediaBucket: dmEnabled ? m[configPostId]!.dmMediaBucket : null,
                  dmMediaPath: dmEnabled ? m[configPostId]!.dmMediaPath : null,
                  dmImageEnabled: dmEnabled ? m[configPostId]!.dmImageEnabled : false,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangeDmTemplate={(index: number, dmTemplate: string) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmTemplates: m[configPostId]!.dmTemplates.map((template, i) =>
                    i === index ? dmTemplate : template,
                  ),
                  dmCtaText: m[configPostId]!.dmCtaText,
                  dmCtaGreeting: m[configPostId]!.dmCtaGreeting,
                  dmCtaEnabled: m[configPostId]!.dmCtaEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onAddDmTemplate={() => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmTemplates: [...m[configPostId]!.dmTemplates, ''],
                  dmCtaText: m[configPostId]!.dmCtaText,
                  dmCtaGreeting: m[configPostId]!.dmCtaGreeting,
                  dmCtaEnabled: m[configPostId]!.dmCtaEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onRemoveDmTemplate={(index: number) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmTemplates:
                    m[configPostId]!.dmTemplates.length > 1
                      ? m[configPostId]!.dmTemplates.filter((_, i) => i !== index)
                      : [''],
                  dmCtaText: m[configPostId]!.dmCtaText,
                  dmCtaGreeting: m[configPostId]!.dmCtaGreeting,
                  dmCtaEnabled: m[configPostId]!.dmCtaEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onToggleDmImage={(dmImageEnabled: boolean) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmImageEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangeDmImage={async (file: File | null) => {
          if (!configPostId) return
          if (!file) {
            setListenerDraftsByPostId((m) => ({
              ...m,
              [configPostId]: m[configPostId]
                ? {
                    ...m[configPostId]!,
                    dmMediaKind: null,
                    dmMediaBucket: null,
                    dmMediaPath: null,
                    dmImageEnabled: false,
                    dirty: true,
                    error: null,
                  }
                : m[configPostId],
            }))
            return
          }

          // Hard cap to reduce Meta upload failures/timeouts.
          // 4 MiB = 4 * 1024 * 1024 bytes.
          const MAX_DM_IMAGE_BYTES = 4 * 1024 * 1024
          if (file.size > MAX_DM_IMAGE_BYTES) {
            setListenerDraftsByPostId((m) => ({
              ...m,
              [configPostId]: m[configPostId]
                ? {
                    ...m[configPostId]!,
                    error: 'Image must be 4MB or less',
                  }
                : m[configPostId],
            }))
            return
          }


          // Upload immediately so the automation can reuse the same asset.
          try {
            const { supabase } = await import('../lib/supabase')
            const { data: auth } = await supabase.auth.getUser()
            const uid = auth.user?.id
            if (!uid) throw new Error('Not authenticated')

            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
            const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg'
            const path = `${uid}/dm/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`

            const { error: uploadError } = await supabase.storage
              .from('automation-media')
              .upload(path, file, { upsert: false, contentType: file.type || undefined })
            if (uploadError) throw uploadError

            setListenerDraftsByPostId((m) => ({
              ...m,
              [configPostId]: m[configPostId]
                ? {
                    ...m[configPostId]!,
                    dmMediaKind: 'image',
                    dmMediaBucket: 'automation-media',
                    dmMediaPath: path,
                    dmImageEnabled: true,
                    dirty: true,
                    error: null,
                  }
                : m[configPostId],
            }))
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to upload image'
            setListenerDraftsByPostId((m) => ({
              ...m,
              [configPostId]: m[configPostId]
                ? {
                    ...m[configPostId]!,
                    error: msg,
                  }
                : m[configPostId],
            }))
          }
        }}
        onChangeDmCtaText={(dmCtaText) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmCtaText,
                  dmCtaGreeting: m[configPostId]!.dmCtaGreeting,
                  dmCtaEnabled: m[configPostId]!.dmCtaEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onChangeDmCtaGreeting={(dmCtaGreeting: string) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmCtaGreeting,
                  dmCtaText: m[configPostId]!.dmCtaText,
                  dmCtaEnabled: m[configPostId]!.dmCtaEnabled,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onToggleDmCtaEnabled={(dmCtaEnabled: boolean) => {
          if (!configPostId) return
          setListenerDraftsByPostId((m) => ({
            ...m,
            [configPostId]: m[configPostId]
              ? {
                  ...m[configPostId]!,
                  dmCtaEnabled,
                  dmCtaGreeting: m[configPostId]!.dmCtaGreeting,
                  dmCtaText: m[configPostId]!.dmCtaText,
                  dirty: true,
                  error: null,
                }
              : m[configPostId],
          }))
        }}
        onSave={() => {
          if (!configPostId) return
          void onSaveListener(configPostId)
        }}
      />

      <FailedExecutionsDialog
        open={Boolean(failedExecutionsPostId)}
        loading={failedExecutionsPostId ? failedExecutionsLoadingByPostId[failedExecutionsPostId] ?? false : false}
        error={failedExecutionsPostId ? failedExecutionsErrorByPostId[failedExecutionsPostId] ?? null : null}
        executions={failedExecutionsPostId ? failedExecutionsByPostId[failedExecutionsPostId] ?? [] : []}
        retryStateById={failedExecutionsRetryState}
        onRetry={(executionId) => {
          if (!failedExecutionsPostId) return
          void onRetryFailedExecution(failedExecutionsPostId, executionId)
        }}
        onClose={() => setFailedExecutionsPostId(null)}
      />
    </section>
  )
}
