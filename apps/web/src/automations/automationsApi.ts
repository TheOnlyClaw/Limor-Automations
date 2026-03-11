import { ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import { toPostAutomation, type AutomationAction, type AutomationBundleRow, type AutomationRule, type PostAutomation } from './mappers'

const automationSelect = [
  'id',
  'connection_id',
  'ig_post_id',
  'name',
  'enabled',
  'dm_cta_text',
  'dm_cta_greeting',
  'dm_cta_enabled',
  'created_at',
  'updated_at',
  'automation_rules(id, pattern, flags, created_at)',
  'automation_actions(id, type, template, use_ai, sort_order, cta_text, media_kind, media_bucket, media_path, caption, created_at)',
].join(', ')

type RpcClient = {
  rpc: <T>(
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: T | null
    error: { message: string } | null
  }>
}

type RuleInput = Array<{ pattern: string; flags?: string }>
type ActionInput = Array<{
  type: 'reply' | 'dm'
  template: string
  useAi?: boolean
  ctaText?: string | null
  mediaKind?: 'image' | null
  mediaBucket?: string | null
  mediaPath?: string | null
  caption?: string | null
}>

type CreateAutomationInput = {
  connectionId: string
  igPostId: string
  name?: string
  enabled?: boolean
  dmCtaText?: string | null
  dmCtaGreeting?: string | null
  dmCtaEnabled?: boolean
  rules?: RuleInput
  actions?: ActionInput
}

type PatchAutomationInput = {
  name?: string | null
  enabled?: boolean
  dmCtaText?: string | null
  dmCtaGreeting?: string | null
  dmCtaEnabled?: boolean
  rules?: RuleInput
  actions?: ActionInput
}

function toApiError(message: string, status = 500) {
  return new ApiError(status, message)
}

function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient
}

async function fetchAutomationById(id: string): Promise<PostAutomation> {
  const { data, error } = await supabase.from('automations').select(automationSelect).eq('id', id).maybeSingle()

  if (error) throw toApiError(error.message)
  if (!data) throw toApiError('Automation not found', 404)

  return toPostAutomation(data as unknown as AutomationBundleRow)
}

export type { AutomationAction, AutomationRule, PostAutomation }

export async function listPostAutomations(params: {
  connectionId?: string
  igPostId?: string
}): Promise<PostAutomation[]> {
  let query = supabase.from('automations').select(automationSelect).order('created_at', { ascending: false })

  if (params.connectionId) query = query.eq('connection_id', params.connectionId)
  if (params.igPostId) query = query.eq('ig_post_id', params.igPostId)

  const { data, error } = await query
  if (error) throw toApiError(error.message)

  return (data ?? []).map((row) => toPostAutomation(row as unknown as AutomationBundleRow))
}

export async function createPostAutomation(body: CreateAutomationInput): Promise<PostAutomation> {
  const { data, error } = await rpcClient().rpc<string>('create_automation_bundle', {
    p_connection_id: body.connectionId,
    p_ig_post_id: body.igPostId,
    p_name: body.name ?? null,
    p_enabled: body.enabled ?? true,
    p_dm_cta_text: body.dmCtaText ?? null,
    p_dm_cta_greeting: body.dmCtaGreeting ?? null,
    p_dm_cta_enabled: body.dmCtaEnabled ?? false,
    p_rules: body.rules ?? [],
    p_actions: body.actions ?? [],
  })

  if (error) throw toApiError(error.message, 400)
  if (!data) throw toApiError('Automation creation returned no id')

  return fetchAutomationById(data)
}

export async function patchPostAutomation(id: string, body: PatchAutomationInput): Promise<PostAutomation> {
  const { data, error } = await rpcClient().rpc<string>('update_automation_bundle', {
    p_automation_id: id,
    p_name: body.name ?? null,
    p_name_is_set: Object.prototype.hasOwnProperty.call(body, 'name'),
    p_enabled: body.enabled === undefined ? null : body.enabled,
    p_dm_cta_text: body.dmCtaText ?? null,
    p_dm_cta_greeting: body.dmCtaGreeting ?? null,
    p_dm_cta_enabled: body.dmCtaEnabled ?? null,
    p_rules: body.rules === undefined ? null : body.rules,
    p_actions: body.actions === undefined ? null : body.actions,
  })

  if (error) throw toApiError(error.message, 400)
  if (!data) throw toApiError('Automation update returned no id')

  return fetchAutomationById(data)
}
