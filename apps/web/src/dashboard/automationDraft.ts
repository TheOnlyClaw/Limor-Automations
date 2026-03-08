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
  dmTemplates: string[]
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
  | 'dmTemplates'
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
    dmTemplates,
    dmCtaText,
    dmCtaGreeting,
    dmCtaEnabled,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()
  const replyMessages = draft.replyTemplates.map((template) => template.trim()).filter(Boolean)
  const dmMessages = draft.dmTemplates.map((template) => template.trim()).filter(Boolean)

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean }> = []
  if (draft.replyEnabled) {
    replyMessages.forEach((message) => {
      actions.push({ type: 'reply', template: message, useAi: draft.replyUseAi })
    })
  }
  if (draft.dmEnabled) {
    dmMessages.forEach((message) => {
      const action: { type: 'dm'; template: string; useAi: boolean } = {
        type: 'dm',
        template: message,
        useAi: false,
      }
      actions.push(action)
    })
  }

  return { rules, actions }
}
