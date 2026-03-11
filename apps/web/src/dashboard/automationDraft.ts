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
  dmMediaKind: 'image' | null
  dmMediaBucket: string | null
  dmMediaPath: string | null
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
  const dmImageEnabled = Boolean(firstDm?.mediaPath)
  const dmMediaKind = (firstDm?.mediaKind as any) ?? null
  const dmMediaBucket = firstDm?.mediaBucket ?? null
  const dmMediaPath = firstDm?.mediaPath ?? null
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
    dmCtaText,
    dmCtaGreeting,
    dmCtaEnabled,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; mediaKind?: 'image' | null; mediaBucket?: string | null; mediaPath?: string | null }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()
  const replyMessages = draft.replyTemplates.map((template) => template.trim()).filter(Boolean)
  const dmMessages = draft.dmTemplates.map((template) => template.trim()).filter(Boolean)

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; mediaKind?: 'image' | null; mediaBucket?: string | null; mediaPath?: string | null }> = []
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
        mediaKind?: 'image' | null
        mediaBucket?: string | null
        mediaPath?: string | null
      } = {
        type: 'dm',
        template: message,
        useAi: false,
        mediaKind: draft.dmImageEnabled ? (draft.dmMediaKind ?? null) : null,
        mediaBucket: draft.dmImageEnabled ? (draft.dmMediaBucket ?? null) : null,
        mediaPath: draft.dmImageEnabled ? (draft.dmMediaPath ?? null) : null,
      }
      actions.push(action)
    })
  }

  return { rules, actions }
}
