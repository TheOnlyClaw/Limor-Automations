import type { PostAutomation } from './automationsApi'

export type AutomationDraft = {
  automationId: string | null
  enabled: boolean
  pattern: string
  flags: string
  replyEnabled: boolean
  replyTemplate: string
  dmEnabled: boolean
  dmTemplate: string
  dirty: boolean
  saving: boolean
  error: string | null
}

export function automationToDraftFields(
  a: PostAutomation | null | undefined,
): Pick<
  AutomationDraft,
  'enabled' | 'pattern' | 'flags' | 'replyEnabled' | 'replyTemplate' | 'dmEnabled' | 'dmTemplate'
> {
  const firstRule = a?.rules?.[0]
  const replyTemplate = a?.actions?.find((x) => x.type === 'reply')?.template ?? ''
  const dmTemplate = a?.actions?.find((x) => x.type === 'dm')?.template ?? ''

  return {
    enabled: Boolean(a?.enabled),
    pattern: firstRule?.pattern ?? '',
    flags: firstRule?.flags ?? '',
    replyEnabled: replyTemplate.trim().length > 0,
    replyTemplate,
    dmEnabled: dmTemplate.trim().length > 0,
    dmTemplate,
  }
}

export function draftToRulesActions(draft: AutomationDraft): {
  rules: Array<{ pattern: string; flags?: string }>
  actions: Array<{ type: 'reply' | 'dm'; template: string }>
} {
  const pattern = draft.pattern.trim()
  const flags = draft.flags.trim()

  const rules = pattern.length ? [{ pattern, ...(flags.length ? { flags } : {}) }] : []

  const actions: Array<{ type: 'reply' | 'dm'; template: string }> = []
  if (draft.replyEnabled) actions.push({ type: 'reply', template: draft.replyTemplate.trim() })
  if (draft.dmEnabled) actions.push({ type: 'dm', template: draft.dmTemplate.trim() })

  return { rules, actions }
}
