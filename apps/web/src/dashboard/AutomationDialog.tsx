import { useEffect } from 'react'
import type { InstagramPost } from './instagramPostsApi'
import type { PostAutomation } from './automationsApi'
import type { AutomationDraft } from './automationDraft'

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
      {message}
    </div>
  )
}

export function AutomationDialog({
  open,
  post,
  automation,
  draft,
  onClose,
  onToggleEnabled,
  onChangePattern,
  onChangeFlags,
  onToggleReply,
  onChangeReplyTemplate,
  onToggleDm,
  onChangeDmTemplate,
  onSave,
}: {
  open: boolean
  post: InstagramPost | null
  automation: PostAutomation | undefined
  draft: AutomationDraft | undefined
  onClose: () => void
  onToggleEnabled: (enabled: boolean) => void
  onChangePattern: (pattern: string) => void
  onChangeFlags: (flags: string) => void
  onToggleReply: (enabled: boolean) => void
  onChangeReplyTemplate: (template: string) => void
  onToggleDm: (enabled: boolean) => void
  onChangeDmTemplate: (template: string) => void
  onSave: () => void
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null
  if (!draft) return null

  const rulesCount = automation?.rules?.length ?? 0
  const actionsCount = automation?.actions?.length ?? 0

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
              <div className="text-sm font-semibold text-zinc-50">Configure automation</div>
              <div className="mt-1 text-xs text-zinc-400">
                {post ? `Post ${post.id}` : 'Post'}
                {automation ? ` · saved rules: ${rulesCount}, actions: ${actionsCount}` : ' · not saved yet'}
              </div>
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
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span className="font-medium">Listen for comments</span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => onToggleEnabled(e.target.checked)}
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">
                <div className="text-[11px] text-zinc-400">Pattern (JS regex)</div>
                <input
                  className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                  value={draft.pattern}
                  onChange={(e) => onChangePattern(e.target.value)}
                  placeholder="e.g. ^(yes|כן)$"
                  disabled={!draft.enabled}
                />
              </label>

              <label className="grid gap-1">
                <div className="text-[11px] text-zinc-400">Flags (optional)</div>
                <input
                  className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                  value={draft.flags}
                  onChange={(e) => onChangeFlags(e.target.value)}
                  placeholder="i"
                  disabled={!draft.enabled}
                />
              </label>
              <div className="text-xs text-zinc-500 sm:self-end">
                Match happens server-side (Node regex).
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm font-medium text-zinc-50">Messages</div>
              <div className="mt-1 text-xs text-zinc-500">Enable Reply, DM, or both. Empty messages can’t be saved.</div>

              <div className="mt-4 grid gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                    <span className="font-medium">Reply</span>
                    <input
                      type="checkbox"
                      checked={draft.replyEnabled}
                      onChange={(e) => onToggleReply(e.target.checked)}
                    />
                  </label>
                  <textarea
                    className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
                    rows={4}
                    value={draft.replyTemplate}
                    onChange={(e) => onChangeReplyTemplate(e.target.value)}
                    placeholder="Your public reply message"
                    disabled={!draft.replyEnabled}
                  />
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                    <span className="font-medium">DM</span>
                    <input
                      type="checkbox"
                      checked={draft.dmEnabled}
                      onChange={(e) => onToggleDm(e.target.checked)}
                    />
                  </label>
                  <textarea
                    className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
                    rows={4}
                    value={draft.dmTemplate}
                    onChange={(e) => onChangeDmTemplate(e.target.value)}
                    placeholder="Your DM message"
                    disabled={!draft.dmEnabled}
                  />
                </div>
              </div>
            </div>

            {draft.error ? <InlineError message={draft.error} /> : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-zinc-800 px-5 py-4">
            <div className="text-xs text-zinc-500">
              {draft.saving ? 'Saving…' : draft.dirty ? 'Unsaved changes' : automation ? 'Saved' : 'Not saved'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                onClick={onClose}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                disabled={!draft.dirty || draft.saving}
                onClick={onSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
