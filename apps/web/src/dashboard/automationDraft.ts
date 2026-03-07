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
> {
  const firstRule = a?.rules?.[0]
  const replyAction = a?.actions?.find((x) => x.type === 'reply')
  const dmActions = a?.actions?.filter((x) => x.type === 'dm') ?? []
  const replyTemplate = replyAction?.template ?? ''
  const dmTemplates = dmActions.length ? dmActions.map((action) => action.template) : ['']
  const dmEnabled = dmTemplates.some((template) => template.trim().length > 0)

  return {
    enabled: Boolean(a?.enabled),
    pattern: firstRule?.pattern ?? '',
    flags: firstRule?.flags ?? '',
    replyEnabled: replyTemplate.trim().length > 0,
    replyTemplate,
    replyUseAi: Boolean(replyAction?.useAi),
    dmEnabled,
    dmTemplates,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()
  const dmMessages = draft.dmTemplates.map((template) => template.trim()).filter(Boolean)

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string; useAi: boolean }> = []
  if (draft.replyEnabled) {
    actions.push({ type: 'reply', template: draft.replyTemplate.trim(), useAi: draft.replyUseAi })
  }
  if (draft.dmEnabled) {
    for (const message of dmMessages) {
      actions.push({ type: 'dm', template: message, useAi: false })
    }
  }

  return { rules, actions }
}
