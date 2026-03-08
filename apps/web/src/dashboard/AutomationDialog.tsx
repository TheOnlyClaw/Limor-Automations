import { useEffect, useState } from 'react'
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
  onToggleReplyUseAi,
  onChangeReplyTemplate,
  onToggleDm,
  onChangeDmTemplate,
  onAddDmTemplate,
  onRemoveDmTemplate,
  onChangeDmCtaText,
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
  onToggleReplyUseAi: (enabled: boolean) => void
  onChangeReplyTemplate: (template: string) => void
  onToggleDm: (enabled: boolean) => void
  onChangeDmTemplate: (index: number, template: string) => void
  onAddDmTemplate: () => void
  onRemoveDmTemplate: (index: number) => void
  onChangeDmCtaText: (ctaText: string) => void
  onSave: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dmTab, setDmTab] = useState(0)

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
  const dmTemplates = draft.dmTemplates.length ? draft.dmTemplates : ['']
  const safeDmTab = Math.min(dmTab, dmTemplates.length - 1)
  const activeDmTemplate = dmTemplates[safeDmTab] ?? ''
  const showDmCta = draft.dmEnabled && dmTemplates.filter((template) => template.trim().length > 0).length > 1
  const dmLimit = 999

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
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {([
                { id: 1, label: 'Pattern' },
                { id: 2, label: 'DM messages' },
                { id: 3, label: 'Reply message' },
              ] as const).map((item) => {
                const isActive = step === item.id
                const isComplete = step > item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    aria-current={isActive ? 'step' : undefined}
                    className={
                      isActive
                        ? 'inline-flex items-center gap-2 rounded-full border border-white/30 bg-white px-3 py-1 text-zinc-950'
                        : isComplete
                          ? 'inline-flex items-center gap-2 rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-emerald-200'
                          : 'inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-zinc-400 hover:text-zinc-200'
                    }
                  >
                    <span className="text-[11px] font-semibold">{item.id}</span>
                    <span className="text-[11px] font-semibold">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {step === 1 ? (
              <div className="mt-5 grid gap-4">
                <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                  <span className="font-medium">Listen for comments</span>
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => onToggleEnabled(e.target.checked)}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 sm:col-span-2">
                    <div className="text-[11px] text-zinc-400">Pattern (JS regex)</div>
                    <input
                      className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                      dir="rtl"
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
                      dir="rtl"
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
              </div>
            ) : null}

            {step === 2 ? (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-50">DM messages</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Optional. Each DM is capped at 999 characters, so add tabs for longer sequences.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <span>Enable</span>
                    <input
                      type="checkbox"
                      checked={draft.dmEnabled}
                      onChange={(e) => onToggleDm(e.target.checked)}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {dmTemplates.map((_, index) => {
                    const isActive = dmTab === index
                    return (
                      <button
                        key={`dm-tab-${index}`}
                        type="button"
                        onClick={() => setDmTab(index)}
                        disabled={!draft.dmEnabled}
                        aria-current={isActive ? 'true' : undefined}
                        className={
                          isActive
                            ? 'rounded-full border border-white/30 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950'
                            : 'rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-60'
                        }
                      >
                        DM {index + 1}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      if (!draft.dmEnabled) return
                      setDmTab(dmTemplates.length)
                      onAddDmTemplate()
                    }}
                    disabled={!draft.dmEnabled}
                    className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300 hover:text-zinc-50 disabled:opacity-60"
                  >
                    + Add DM
                  </button>
                  {dmTemplates.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!draft.dmEnabled) return
                        const nextIndex =
                          safeDmTab === dmTemplates.length - 1 ? safeDmTab - 1 : safeDmTab
                        setDmTab(Math.max(0, nextIndex))
                        onRemoveDmTemplate(safeDmTab)
                      }}
                      disabled={!draft.dmEnabled}
                      className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <textarea
                  className="mt-3 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
                  dir="rtl"
                  rows={5}
                  value={activeDmTemplate}
                  onChange={(e) => onChangeDmTemplate(safeDmTab, e.target.value)}
                  maxLength={dmLimit}
                  placeholder="Your DM message"
                  disabled={!draft.dmEnabled}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>Empty messages can’t be saved.</span>
                  <span className={activeDmTemplate.length >= dmLimit ? 'text-amber-300' : undefined}>
                    {activeDmTemplate.length}/{dmLimit}
                  </span>
                </div>
                {showDmCta ? (
                  <div className="mt-4 grid gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2">
                    <div className="text-[11px] font-semibold text-amber-200">
                      Private accounts require a tap to receive multiple DMs.
                    </div>
                    <label className="grid gap-1">
                      <div className="text-[11px] text-amber-100/80">CTA button text</div>
                      <input
                        className="h-9 rounded-lg border border-amber-900/60 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
                        value={draft.dmCtaText}
                        onChange={(e) => onChangeDmCtaText(e.target.value)}
                        maxLength={20}
                        placeholder="Send me the rest"
                        disabled={!draft.dmEnabled}
                      />
                    </label>
                    <div className="text-[11px] text-amber-200/80">Max 20 characters. Shown as an Instagram quick reply.</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-50">Reply message</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {draft.replyUseAi
                        ? 'AI will paraphrase this base message before sending.'
                        : 'Optional. Reply publicly on the comment.'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <span>Enable</span>
                    <input
                      type="checkbox"
                      checked={draft.replyEnabled}
                      onChange={(e) => onToggleReply(e.target.checked)}
                    />
                  </label>
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                  <span>
                    <span className="block text-[11px] font-semibold text-zinc-200">Use AI to vary message</span>
                    <span className="block text-[11px] text-zinc-500">Keeps the same meaning and tone.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.replyUseAi}
                    onChange={(e) => onToggleReplyUseAi(e.target.checked)}
                    disabled={!draft.replyEnabled}
                  />
                </label>
                <textarea
                  className="mt-3 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
                  dir="rtl"
                  rows={5}
                  value={draft.replyTemplate}
                  onChange={(e) => onChangeReplyTemplate(e.target.value)}
                  placeholder={draft.replyUseAi ? 'Base public reply message' : 'Your public reply message'}
                  disabled={!draft.replyEnabled}
                />
                <div className="mt-2 text-xs text-zinc-500">Empty messages can’t be saved.</div>
              </div>
            ) : null}

            {draft.error ? <InlineError message={draft.error} /> : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-zinc-800 px-5 py-4">
            <div className="text-xs text-zinc-500">
              {draft.saving ? 'Saving…' : draft.dirty ? 'Unsaved changes' : automation ? 'Saved' : 'Not saved'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
                onClick={() => setStep((prev) => (prev === 1 ? prev : (prev - 1) as 1 | 2 | 3))}
                disabled={step === 1}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
                onClick={() => setStep((prev) => (prev === 3 ? prev : (prev + 1) as 1 | 2 | 3))}
                disabled={step === 3}
              >
                Next
              </button>
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
