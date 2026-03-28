import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InstagramPost } from './instagramPostsApi'
import type { PostAutomation } from './automationsApi'
import type { AutomationDraft } from './automationDraft'

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
      <path
        d="M3.75 8.25 6.5 11l5.75-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled ? 'true' : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition duration-200 ease-out motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'border-amber-400/50 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.18)]'
          : 'border-zinc-700 bg-zinc-900',
      )}
    >
      <span
      className={clsx(
          'absolute left-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-zinc-950 shadow-sm transition duration-200 ease-out motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      >
        {checked ? <CheckIcon className="delight-check h-3 w-3" /> : null}
      </span>
    </button>
  )
}

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
  onAddReplyTemplate,
  onRemoveReplyTemplate,
  onToggleDm,
  onChangeDmTemplate,
  onAddDmTemplate,
  onRemoveDmTemplate,
  onChangeDmImage,
  onToggleDmImage,
  onChangeDmCtaText,
  onChangeDmCtaGreeting,
  onToggleDmCtaEnabled,
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
  onChangeReplyTemplate: (index: number, template: string) => void
  onAddReplyTemplate: () => void
  onRemoveReplyTemplate: (index: number) => void
  onToggleDm: (enabled: boolean) => void
  onChangeDmTemplate: (index: number, template: string) => void
  onAddDmTemplate: () => void
  onRemoveDmTemplate: (index: number) => void
  onChangeDmImage: (file: File | null) => void
  onToggleDmImage: (enabled: boolean) => void
  onChangeDmCtaText: (ctaText: string) => void
  onChangeDmCtaGreeting: (ctaGreeting: string) => void
  onToggleDmCtaEnabled: (enabled: boolean) => void
  onSave: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dmTab, setDmTab] = useState(0)
  const [replyTab, setReplyTab] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dmTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingFocusRef = useRef<'dm' | 'reply' | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasSavingRef = useRef(false)
  const handleClose = useCallback(() => {
    setSaveState('idle')
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const timeoutId = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [open])

  const rulesCount = automation?.rules?.length ?? 0
  const actionsCount = automation?.actions?.length ?? 0
  const replyTemplates = draft?.replyTemplates.length ? draft.replyTemplates : ['']
  const safeReplyTab = Math.min(replyTab, replyTemplates.length - 1)
  const activeReplyTemplate = replyTemplates[safeReplyTab] ?? ''
  const dmTemplates = draft?.dmTemplates.length ? draft.dmTemplates : ['']
  const safeDmTab = Math.min(dmTab, dmTemplates.length - 1)
  const activeDmTemplate = dmTemplates[safeDmTab] ?? ''
  const dmCount = dmTemplates.filter((template) => template.trim().length > 0).length
  const showDmCta = Boolean(draft?.dmEnabled) && dmTemplates.length > 0
  const dmLimit = 999
  const replyCount = replyTemplates.filter((template) => template.trim().length > 0).length
  const patternReady = draft?.pattern.trim().length ? true : false
  const dmReady = !draft?.dmEnabled || dmTemplates.every((template) => template.trim().length > 0)
  const replyReady = !draft?.replyEnabled || replyTemplates.every((template) => template.trim().length > 0)
  const saveMessage = draft?.saving
    ? 'Saving your automation...'
    : saveState === 'saved'
      ? 'Saved. This post is ready to respond.'
      : draft?.dirty
        ? 'You have unsaved changes'
        : automation
          ? 'Automation is ready'
          : 'Set the steps you want, then save'

  useEffect(() => {
    if (!open) {
      wasSavingRef.current = false
      return
    }

    if (draft?.saving) {
      wasSavingRef.current = true
      return
    }

    if (wasSavingRef.current && !draft?.error && !draft?.dirty) {
      wasSavingRef.current = false
      const showTimeoutId = window.setTimeout(() => setSaveState('saved'), 0)
      const hideTimeoutId = window.setTimeout(() => setSaveState('idle'), 1800)
      return () => {
        window.clearTimeout(showTimeoutId)
        window.clearTimeout(hideTimeoutId)
      }
    }

    if (saveState === 'saved' && (draft?.dirty || draft?.error)) {
      const timeoutId = window.setTimeout(() => setSaveState('idle'), 0)
      return () => window.clearTimeout(timeoutId)
    }

    wasSavingRef.current = false
  }, [draft?.dirty, draft?.error, draft?.saving, open, saveState])

  useEffect(() => {
    if (pendingFocusRef.current === 'dm' && step === 2) {
      dmTextareaRef.current?.focus()
      dmTextareaRef.current?.setSelectionRange(
        dmTextareaRef.current.value.length,
        dmTextareaRef.current.value.length,
      )
      pendingFocusRef.current = null
    }

    if (pendingFocusRef.current === 'reply' && step === 3) {
      replyTextareaRef.current?.focus()
      replyTextareaRef.current?.setSelectionRange(
        replyTextareaRef.current.value.length,
        replyTextareaRef.current.value.length,
      )
      pendingFocusRef.current = null
    }
  }, [activeDmTemplate, activeReplyTemplate, step])

  useEffect(() => {
    const element = step === 2 ? dmTextareaRef.current : replyTextareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.max(element.scrollHeight, step === 2 ? 152 : 136)}px`
  }, [activeDmTemplate, activeReplyTemplate, step])

  if (!open || !draft) return null

  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
      return
    }

    if (e.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )

    if (!focusable || focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
      return
    }

    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const dialog = (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleClose()
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onKeyDown={onDialogKeyDown}
          className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_80px_rgba(0,0,0,0.7)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
              <div>
                <div id={titleId} className="text-sm font-semibold text-zinc-50">Set up automation</div>
                <div id={descriptionId} className="mt-1 text-xs text-zinc-400">
                  {post ? `Post ${post.id}` : 'This post'}
                  {automation
                    ? ` · saved automation with ${rulesCount} rule${rulesCount === 1 ? '' : 's'} and ${actionsCount} action${actionsCount === 1 ? '' : 's'}`
                    : ' · choose which comments should trigger a DM or public reply'}
                </div>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-400/15 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  Calm setup, quick review, then save when ready.
                </div>
              </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 transition hover:-translate-y-0.5 hover:bg-zinc-900 motion-reduce:transform-none"
              onClick={handleClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="max-h-[80vh] overflow-auto px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
                {([
                  { id: 1, label: 'Comment match', ready: patternReady },
                  { id: 2, label: 'DM messages', ready: dmReady },
                  { id: 3, label: 'Public replies', ready: replyReady },
                ] as const).map((item) => {
                const isActive = step === item.id
                const isComplete = item.ready && step > item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    aria-current={isActive ? 'step' : undefined}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-full px-3 py-1 transition duration-200 ease-out motion-reduce:transition-none',
                      isActive && 'delight-glow border border-white/30 bg-white text-zinc-950 shadow-[0_10px_30px_rgba(255,255,255,0.08)]',
                      !isActive && isComplete && 'border border-emerald-900/60 bg-emerald-950/30 text-emerald-200',
                      !isActive && !isComplete && 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:-translate-y-0.5 hover:text-zinc-200 motion-reduce:transform-none',
                    )}
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-[11px] font-semibold">
                      {isComplete ? <CheckIcon className="delight-check h-3.5 w-3.5" /> : item.id}
                    </span>
                    <span className="text-[11px] font-semibold">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {step === 1 ? (
              <div className="delight-enter mt-5 grid gap-4">
                <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                  <span className="font-medium">Turn on comment automation</span>
                  <Toggle
                    checked={draft.enabled}
                    onChange={onToggleEnabled}
                    label="Turn on comment automation"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 sm:col-span-2">
                    <div className="text-[11px] text-zinc-400">Comment matching rule</div>
                    <input
                      className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                      dir="rtl"
                      value={draft.pattern}
                      onChange={(e) => onChangePattern(e.target.value)}
                      placeholder="e.g. ^(yes|כן)$"
                      disabled={!draft.enabled}
                    />
                    <div className="text-xs text-zinc-500">
                      Advanced. Use a matching rule to choose which comments should start this automation. Example: <code>^(yes|כן)$</code> matches only those exact comments.
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {[
                        { label: 'Exact yes / כן', value: '^(yes|כן)$' },
                        { label: 'Contains link', value: 'link' },
                        { label: 'Case-insensitive', value: draft.flags.includes('i') ? draft.pattern || '^(yes|כן)$' : draft.pattern || '^(yes|כן)$' },
                      ].map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          disabled={!draft.enabled}
                          onClick={() => {
                            onChangePattern(suggestion.value)
                            if (suggestion.label === 'Case-insensitive') onChangeFlags('i')
                          }}
                          className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:-translate-y-0.5 hover:border-amber-400/30 hover:text-zinc-50 disabled:opacity-60 motion-reduce:transform-none"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <div className="text-[11px] text-zinc-400">Matching options (optional)</div>
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
                    Advanced: use <code>i</code> to ignore uppercase and lowercase differences.
                  </div>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="delight-enter mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-50">DM messages</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Optional. Send one or more private messages after someone comments. Each message can be up to 999 characters.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <span>Turn on</span>
                    <Toggle checked={draft.dmEnabled} onChange={onToggleDm} label="Turn on DM messages" />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-zinc-200">
                    {dmCount} ready {dmCount === 1 ? 'message' : 'messages'}
                  </span>
                  <span>Add 1-3 messages if you want the flow to feel more personal.</span>
                </div>
                <div className="mt-4 grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold text-zinc-200">Optional image</div>
                    <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                      <span>Send image</span>
                      <Toggle
                        checked={draft.dmImageEnabled}
                        onChange={onToggleDmImage}
                        disabled={!draft.dmEnabled}
                        label="Send image before the DM"
                      />
                    </label>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    We send the image first. If Instagram does not allow an image here, we send only the text instead. Max size: 4 MB.
                  </div>

                  <label className="grid gap-1">
                    <div className="text-[11px] text-zinc-400">Choose image</div>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!draft.dmEnabled}
                      onChange={(e) => onChangeDmImage(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100"
                    />
                    {draft.dmMediaPath ? (
                      <div className="inline-flex items-center gap-2 text-[11px] text-emerald-200">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
                          <CheckIcon className="h-3 w-3" />
                          Image ready
                        </span>
                        Instagram will try the image first, then fall back to text if needed.
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-600">No image selected</div>
                    )}
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
                            ? 'rounded-full border border-white/30 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950 shadow-[0_10px_24px_rgba(255,255,255,0.08)]'
                            : 'rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 transition hover:-translate-y-0.5 hover:text-zinc-200 disabled:opacity-60 motion-reduce:transform-none'
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
                      pendingFocusRef.current = 'dm'
                      setDmTab(dmTemplates.length)
                      onAddDmTemplate()
                    }}
                    disabled={!draft.dmEnabled}
                    className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300 transition hover:-translate-y-0.5 hover:border-amber-400/30 hover:text-zinc-50 disabled:opacity-60 motion-reduce:transform-none"
                  >
                    + Add another DM
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
                      className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 transition hover:-translate-y-0.5 hover:text-zinc-200 disabled:opacity-60 motion-reduce:transform-none"
                    >
                      Remove this DM
                    </button>
                  ) : null}
                </div>
                <textarea
                  ref={dmTextareaRef}
                  className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 transition focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/10 disabled:opacity-60 motion-reduce:transition-none"
                  dir="rtl"
                  rows={5}
                  value={activeDmTemplate}
                  onChange={(e) => onChangeDmTemplate(safeDmTab, e.target.value)}
                  maxLength={dmLimit}
                  placeholder="Write the DM to send"
                  disabled={!draft.dmEnabled}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>
                    {activeDmTemplate.trim().length
                      ? 'This message is ready to send after a matching comment.'
                      : 'Start with the first private message you want commenters to receive.'}
                  </span>
                  <span className={activeDmTemplate.length >= dmLimit ? 'text-amber-300' : undefined}>
                    {activeDmTemplate.length}/{dmLimit}
                  </span>
                </div>
                {showDmCta ? (
                  <div className="mt-4 grid gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2">
                    <div className="text-[11px] font-semibold text-amber-200">
                      Before the DM messages, Instagram can show a short intro message with a button so people can open the messages.
                    </div>
                    {dmCount <= 1 ? (
                      <label className="flex items-center justify-between gap-3 text-[11px] text-amber-100/80">
                        <span>Show intro message</span>
                        <Toggle
                          checked={draft.dmCtaEnabled}
                          onChange={onToggleDmCtaEnabled}
                          disabled={!draft.dmEnabled}
                          label="Show intro message"
                        />
                      </label>
                    ) : null}
                    <label className="grid gap-1">
                      <div className="text-[11px] text-amber-100/80">Intro message</div>
                      <textarea
                        className="min-h-[72px] w-full resize-y rounded-lg border border-amber-900/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
                        dir="rtl"
                        value={draft.dmCtaGreeting}
                        onChange={(e) => onChangeDmCtaGreeting(e.target.value)}
                        placeholder="Thanks for your comment. Tap below to get the messages."
                        disabled={!draft.dmEnabled}
                      />
                    </label>
                    <label className="grid gap-1">
                      <div className="text-[11px] text-amber-100/80">Button text</div>
                      <input
                        className="h-9 rounded-lg border border-amber-900/60 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
                        dir="rtl"
                        value={draft.dmCtaText}
                        onChange={(e) => onChangeDmCtaText(e.target.value)}
                        maxLength={20}
                        placeholder="Send me the messages"
                        disabled={!draft.dmEnabled}
                      />
                    </label>
                    <div className="text-[11px] text-amber-200/80">Up to 20 characters. This appears on the Instagram button.</div>
                    {(draft.dmCtaGreeting.trim().length > 0 || draft.dmCtaText.trim().length > 0) && draft.dmCtaEnabled ? (
                      <div className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-[11px] text-amber-50/90">
                        <div className="font-semibold text-amber-100">Instagram preview</div>
                        <div className="mt-1 text-amber-50/80">
                          {draft.dmCtaGreeting.trim() || 'Thanks for your comment. Tap below to get the messages.'}
                        </div>
                        <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-950">
                          {draft.dmCtaText.trim() || 'Send me the messages'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="delight-enter mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-50">Public replies</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      One public reply is chosen at random for each matching comment.
                    </div>
                    <div className="text-xs text-zinc-500">
                      {draft.replyUseAi
                        ? 'AI adjusts the wording before sending the reply, while keeping the same meaning.'
                        : 'Optional. Send a public reply on the post as well.'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <span>Turn on</span>
                    <Toggle checked={draft.replyEnabled} onChange={onToggleReply} label="Turn on public replies" />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-zinc-200">
                    {replyCount} ready {replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                  <span>Add a few variations to keep replies feeling natural.</span>
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                  <span>
                    <span className="block text-[11px] font-semibold text-zinc-200">Use AI to vary each reply</span>
                    <span className="block text-[11px] text-zinc-500">The meaning stays the same, but the wording can change.</span>
                  </span>
                  <Toggle
                    checked={draft.replyUseAi}
                    onChange={onToggleReplyUseAi}
                    disabled={!draft.replyEnabled}
                    label="Use AI to vary each reply"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {replyTemplates.map((_, index) => {
                    const isActive = replyTab === index
                    return (
                      <button
                        key={`reply-tab-${index}`}
                        type="button"
                        onClick={() => setReplyTab(index)}
                        disabled={!draft.replyEnabled}
                        aria-current={isActive ? 'true' : undefined}
                        className={
                          isActive
                            ? 'rounded-full border border-white/30 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950 shadow-[0_10px_24px_rgba(255,255,255,0.08)]'
                            : 'rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 transition hover:-translate-y-0.5 hover:text-zinc-200 disabled:opacity-60 motion-reduce:transform-none'
                        }
                      >
                        Reply {index + 1}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      if (!draft.replyEnabled) return
                      pendingFocusRef.current = 'reply'
                      setReplyTab(replyTemplates.length)
                      onAddReplyTemplate()
                    }}
                    disabled={!draft.replyEnabled}
                    className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300 transition hover:-translate-y-0.5 hover:border-amber-400/30 hover:text-zinc-50 disabled:opacity-60 motion-reduce:transform-none"
                  >
                    + Add another reply
                  </button>
                  {replyTemplates.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!draft.replyEnabled) return
                        const nextIndex =
                          safeReplyTab === replyTemplates.length - 1 ? safeReplyTab - 1 : safeReplyTab
                        setReplyTab(Math.max(0, nextIndex))
                        onRemoveReplyTemplate(safeReplyTab)
                      }}
                      disabled={!draft.replyEnabled}
                      className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-400 transition hover:-translate-y-0.5 hover:text-zinc-200 disabled:opacity-60 motion-reduce:transform-none"
                    >
                      Remove this reply
                    </button>
                  ) : null}
                </div>
                <textarea
                  ref={replyTextareaRef}
                  className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 transition focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/10 disabled:opacity-60 motion-reduce:transition-none"
                  dir="rtl"
                  rows={5}
                  value={activeReplyTemplate}
                  onChange={(e) => onChangeReplyTemplate(safeReplyTab, e.target.value)}
                  placeholder={draft.replyUseAi ? 'Write the base public reply' : 'Write the public reply to send'}
                  disabled={!draft.replyEnabled}
                />
                <div className="mt-2 text-xs text-zinc-500">
                  {activeReplyTemplate.trim().length
                    ? 'This reply is ready. Instagram will choose one variation at random.'
                    : 'Write one steady public reply, then add variations if you want a softer, less repetitive tone.'}
                </div>
              </div>
            ) : null}

            {draft.error ? <InlineError message={draft.error} /> : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-zinc-800 px-5 py-4">
            <div
              className={clsx(
                'inline-flex items-center gap-2 text-xs transition-colors',
                draft.saving && 'text-amber-100',
                saveState === 'saved' && 'text-emerald-200',
                !draft.saving && saveState !== 'saved' && 'text-zinc-500',
              )}
            >
              <span
                className={clsx(
                  'h-2 w-2 rounded-full',
                  draft.saving && 'bg-amber-300',
                  saveState === 'saved' && 'delight-check bg-emerald-300',
                  !draft.saving && saveState !== 'saved' && 'bg-zinc-700',
                )}
              />
              {saveMessage}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:-translate-y-0.5 hover:bg-zinc-900 disabled:opacity-60 motion-reduce:transform-none"
                onClick={() => setStep((prev) => (prev === 1 ? prev : (prev - 1) as 1 | 2 | 3))}
                disabled={step === 1}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:-translate-y-0.5 hover:bg-zinc-900 disabled:opacity-60 motion-reduce:transform-none"
                onClick={() => setStep((prev) => (prev === 3 ? prev : (prev + 1) as 1 | 2 | 3))}
                disabled={step === 3}
              >
                Next
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:-translate-y-0.5 hover:bg-zinc-900 motion-reduce:transform-none"
                onClick={handleClose}
              >
                Close
              </button>
              <button
                type="button"
                className={clsx(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition motion-reduce:transform-none motion-reduce:transition-none',
                  'disabled:opacity-60',
                  saveState === 'saved'
                    ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-50'
                    : 'bg-white text-zinc-950 hover:-translate-y-0.5 hover:bg-zinc-100 active:translate-y-0.5',
                )}
                disabled={!draft.dirty || draft.saving}
                onClick={onSave}
              >
                {draft.saving ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-950" />
                    Saving...
                  </>
                ) : saveState === 'saved' ? (
                  <>
                    <CheckIcon className="delight-check h-4 w-4" />
                    Saved
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
