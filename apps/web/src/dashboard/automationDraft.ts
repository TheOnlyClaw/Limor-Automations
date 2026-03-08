import type { PostAutomation } from './automationsApi'

export type AutomationDraft = {
  automationId: string | null
  enabled: boolean
  pattern: string
  flags: string
  replyEnabled: boolean
  replyTemplate: string
  replyUseAi: boolean
  dmEnabled: boolean
  dmTemplates: string[]
  dmCtaText: string
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
  | 'replyTemplate'
  | 'replyUseAi'
  | 'dmEnabled'
  | 'dmTemplates'
  | 'dmCtaText'
> {
  const firstRule = a?.rules?.[0]
  const replyAction = a?.actions?.find((x) => x.type === 'reply')
  const dmActions = a?.actions?.filter((x) => x.type === 'dm') ?? []
  const replyTemplate = replyAction?.template ?? ''
  const dmTemplates = dmActions.length ? dmActions.map((action) => action.template) : ['']
  const dmEnabled = dmTemplates.some((template) => template.trim().length > 0)
  const dmCtaText = dmActions.length > 1 ? dmActions[0]?.ctaText ?? '' : ''

  return {
    enabled: Boolean(a?.enabled),
    pattern: firstRule?.pattern ?? '',
    flags: firstRule?.flags ?? '',
    replyEnabled: replyTemplate.trim().length > 0,
    replyTemplate,
    replyUseAi: Boolean(replyAction?.useAi),
    dmEnabled,
    dmTemplates,
    dmCtaText,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; ctaText?: string | null }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()
  const dmMessages = draft.dmTemplates.map((template) => template.trim()).filter(Boolean)
  const dmCtaText = draft.dmCtaText.trim()

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean; ctaText?: string | null }> = []
  if (draft.replyEnabled) {
    actions.push({ type: 'reply', template: draft.replyTemplate.trim(), useAi: draft.replyUseAi })
  }
  if (draft.dmEnabled) {
    dmMessages.forEach((message, index) => {
      const action: { type: 'dm'; template: string; useAi: boolean; ctaText?: string | null } = {
        type: 'dm',
        template: message,
        useAi: false,
      }
      if (dmMessages.length > 1 && index === 0) {
        action.ctaText = dmCtaText.length ? dmCtaText : null
      }
      actions.push(action)
    })
  }

  return { rules, actions }
}
