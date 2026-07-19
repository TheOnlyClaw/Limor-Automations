import type { PostAutomation } from './automationsApi'

export type AutomationDraft = {
  automationId: string | null
  enabled: boolean
  pattern: string
  flags: string
  replyEnabled: boolean
  replyTemplates: string[]
  replyUseAi: boolean
  dmEnabled: boolean
  dmImageEnabled: boolean
  dmTemplates: string[]
  dmMediaKind: 'image' | 'video' | null
  dmMediaBucket: string | null
  dmMediaPath: string | null
  dmMediaUrl: string
  dmCtaText: string
  dmCtaGreeting: string
  dmCtaEnabled: boolean
  dirty: boolean
  saving: boolean
  error: string | null
}

export function automationToDraftFields(
  a: PostAutomation | null | undefined,
): Pick<
  AutomationDraft,
  | 'enabled'
  | 'pattern'
  | 'flags'
  | 'replyEnabled'
  | 'replyTemplates'
  | 'replyUseAi'
  | 'dmEnabled'
  | 'dmImageEnabled'
  | 'dmTemplates'
  | 'dmMediaKind'
  | 'dmMediaBucket'
  | 'dmMediaPath'
  | 'dmMediaUrl'
  | 'dmCtaText'
  | 'dmCtaGreeting'
  | 'dmCtaEnabled'
> {
  const firstRule = a?.rules?.[0]
  const replyActions = a?.actions?.filter((x) => x.type === 'reply') ?? []
  const dmActions = a?.actions?.filter((x) => x.type === 'dm') ?? []
  const replyTemplates = replyActions.length ? replyActions.map((action) => action.template) : ['']
  const dmTemplates = dmActions.length ? dmActions.map((action) => action.template) : ['']
  const replyEnabled = replyTemplates.some((template) => template.trim().length > 0)
  const dmEnabled = dmTemplates.some((template) => template.trim().length > 0)
  const firstDm = dmActions[0]
  const dmMediaKind = (firstDm as { mediaKind?: 'image' | 'video' | null } | undefined)?.mediaKind ?? null
  const dmMediaBucket = firstDm?.mediaBucket ?? null
  const dmMediaPath = firstDm?.mediaPath ?? null
  const dmMediaUrl = (firstDm as { mediaUrl?: string | null } | undefined)?.mediaUrl ?? ''
  const dmImageEnabled = dmMediaKind === 'video'
    ? Boolean((firstDm as { mediaUrl?: string | null } | undefined)?.mediaUrl)
    : Boolean((firstDm as { mediaEnabled?: boolean | null } | undefined)?.mediaEnabled ?? firstDm?.mediaPath)
  const dmCtaText = a?.dmCtaText ?? ''
  const dmCtaGreeting = a?.dmCtaGreeting ?? ''
  const dmCtaEnabled = Boolean(a?.dmCtaEnabled)
  const replyUseAi = replyActions.some((action) => Boolean(action.useAi))

  return {
    enabled: Boolean(a?.enabled),
    pattern: firstRule?.pattern ?? '',
    flags: firstRule?.flags ?? '',
    replyEnabled,
    replyTemplates,
    replyUseAi,
    dmEnabled,
    dmImageEnabled,
    dmTemplates,
    dmMediaKind,
    dmMediaBucket,
    dmMediaPath,
    dmMediaUrl,
    dmCtaText,
    dmCtaGreeting,
    dmCtaEnabled,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; mediaKind?: 'image' | 'video' | null; mediaBucket?: string | null; mediaPath?: string | null; mediaUrl?: string | null; mediaEnabled?: boolean }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()
  const replyMessages = draft.replyTemplates.map((template) => template.trim()).filter(Boolean)
  const dmMessages = draft.dmTemplates.map((template) => template.trim()).filter(Boolean)

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; mediaKind?: 'image' | 'video' | null; mediaBucket?: string | null; mediaPath?: string | null; mediaUrl?: string | null; mediaEnabled?: boolean }> = []
  if (draft.replyEnabled) {
    replyMessages.forEach((message) => {
      actions.push({ type: 'reply', template: message, useAi: draft.replyUseAi })
    })
  }
  if (draft.dmEnabled) {
    dmMessages.forEach((message) => {
      const action: {
        type: 'dm'
        template: string
        useAi: boolean
        mediaKind?: 'image' | 'video' | null
        mediaBucket?: string | null
        mediaPath?: string | null
        mediaUrl?: string | null
        mediaEnabled?: boolean
      } = {
        type: 'dm',
        template: message,
        useAi: false,
        // Always persist the last uploaded media (kind/bucket/path) so the UI can
        // toggle "send image" on/off without losing the upload.
        mediaKind: draft.dmMediaKind ?? null,
        mediaBucket: draft.dmMediaBucket ?? null,
        mediaPath: draft.dmMediaPath ?? null,
        mediaUrl: draft.dmMediaUrl || null,
        // This is the actual "send attachment" switch.
        mediaEnabled: draft.dmMediaKind === 'video'
          ? Boolean(draft.dmMediaUrl)
          : Boolean(draft.dmImageEnabled),
      }
      actions.push(action)
    })
  }

  return { rules, actions }
}
