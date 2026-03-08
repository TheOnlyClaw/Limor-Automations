import type { Tables } from '../lib/supabaseDatabase'

export type AutomationRule = {
  id: string
  pattern: string
  flags: string | null
  createdAt: string
}

export type AutomationAction = {
  id: string
  type: 'reply' | 'dm'
  template: string
  useAi: boolean
  ctaText: string | null
  sortOrder: number
  createdAt: string
}

export type PostAutomation = {
  id: string
  connectionId: string
  igPostId: string
  name: string | null
  enabled: boolean
  dmCtaGreeting: string | null
  dmCtaText: string | null
  dmCtaEnabled: boolean
  rules: AutomationRule[]
  actions: AutomationAction[]
  createdAt: string
  updatedAt: string
}

export type AutomationBundleRow = Tables<'automations'> & {
  automation_rules: Array<Tables<'automation_rules'>> | null
  automation_actions: Array<Tables<'automation_actions'>> | null
}

function byCreatedAtAsc<T extends { created_at: string }>(a: T, b: T) {
  return a.created_at.localeCompare(b.created_at)
}

function byActionOrderAsc<T extends { sort_order?: number | null; created_at: string }>(a: T, b: T) {
  const aOrder = a.sort_order ?? 0
  const bOrder = b.sort_order ?? 0
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.created_at.localeCompare(b.created_at)
}

function toActionType(value: string): 'reply' | 'dm' {
  return value === 'dm' ? 'dm' : 'reply'
}

export function toPostAutomation(row: AutomationBundleRow): PostAutomation {
  const rules = [...(row.automation_rules ?? [])].sort(byCreatedAtAsc).map((rule) => ({
    id: rule.id,
    pattern: rule.pattern,
    flags: rule.flags,
    createdAt: rule.created_at,
  }))

  const actions = [...(row.automation_actions ?? [])].sort(byActionOrderAsc).map((action) => ({
    id: action.id,
    type: toActionType(action.type),
    template: action.template,
    useAi: Boolean(action.use_ai),
    ctaText: action.cta_text ?? null,
    sortOrder: action.sort_order ?? 0,
    createdAt: action.created_at,
  }))

  return {
    id: row.id,
    connectionId: row.connection_id,
    igPostId: row.ig_post_id,
    name: row.name,
    enabled: row.enabled,
    dmCtaGreeting: row.dm_cta_greeting ?? null,
    dmCtaText: row.dm_cta_text ?? null,
    dmCtaEnabled: Boolean(row.dm_cta_enabled),
    rules,
    actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
