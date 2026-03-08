import { useEffect, useState } from 'react'
import type { FailedExecution } from './failedExecutionsApi'

type RetryStatus = 'idle' | 'retrying' | 'failed'

function formatActionLabel(type: FailedExecution['actionType']) {
  return type === 'reply' ? 'Reply' : 'DM'
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function parseRawError(message: string | null) {
  if (!message) return { summary: null, raw: null }
  const marker = ' | raw='
  const index = message.indexOf(marker)
  if (index === -1) return { summary: message, raw: null }
  const summary = message.slice(0, index)
  const rawText = message.slice(index + marker.length)
  return { summary, raw: rawText }
}

export function FailedExecutionsDialog({
  open,
  loading,
  error,
  executions,
  retryStateById,
  onRetry,
  onClose,
}: {
  open: boolean
  loading: boolean
  error: string | null
  executions: FailedExecution[]
  retryStateById: Record<string, RetryStatus | undefined>
  onRetry: (id: string) => void
  onClose: () => void
}) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    setExpandedById({})
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_80px_rgba(0,0,0,0.7)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-zinc-50">Failed executions</div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
              onClick={onClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="max-h-[80vh] overflow-auto px-5 py-4">
            {loading ? <div className="text-sm text-zinc-400">Loading failed executions…</div> : null}

            {error ? (
              <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {!loading && !error && executions.length === 0 ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400">
                No failed executions for this post.
              </div>
            ) : null}

            <div className="grid gap-3">
              {executions.map((execution) => {
                const retryState = retryStateById[execution.id] ?? 'idle'
                const parsed = parseRawError(execution.lastError)
                const isExpanded = expandedById[execution.id] ?? false
                return (
                  <div
                    key={execution.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-300">
                            {formatActionLabel(execution.actionType)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Attempts: {execution.attempts}
                          </div>
                          <div className="text-[11px] text-zinc-500" title={execution.updatedAt}>
                            {formatDateTime(execution.updatedAt)}
                          </div>
                          {execution.recipientUsername ? (
                            <div className="text-[11px] text-zinc-400">@{execution.recipientUsername}</div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs text-zinc-200">
                          {parsed.summary ?? 'Unknown error'}
                        </div>
                        {parsed.raw ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="text-[11px] text-zinc-400 hover:text-zinc-200"
                              onClick={() =>
                                setExpandedById((prev) => ({
                                  ...prev,
                                  [execution.id]: !isExpanded,
                                }))
                              }
                            >
                              {isExpanded ? 'Hide raw error' : 'Show raw error'}
                            </button>
                            {isExpanded ? (
                              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
                                {parsed.raw}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                        {execution.messageText ? (
                          <div className="mt-2 text-xs text-zinc-500">
                            Message ({execution.messageSource ?? 'template'}): {execution.messageText}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                          disabled={retryState === 'retrying'}
                          onClick={() => onRetry(execution.id)}
                        >
                          {retryState === 'retrying' ? 'Retrying…' : 'Retry'}
                        </button>
                        {retryState === 'failed' ? (
                          <div className="text-[11px] text-red-300">Retry failed</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
