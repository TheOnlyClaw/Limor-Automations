import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders, errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../_shared/crypto.ts'
import { generateGeminiVariant } from '../_shared/gemini.ts'
import { sendCommentReply, sendDm, sendDmWithImage, sendRecipientDm, sendRecipientDmWithImage } from '../_shared/instagramActions.ts'
import { GraphError } from '../_shared/instagramGraph.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { extractCommentEvent, isReplyComment, isSelfComment, type ParsedCommentEvent } from '../_shared/webhook.ts'

declare const Deno: any

const textEncoder = new TextEncoder()

type AutomationRow = {
  id: string
  owner_user_id: string
  connection_id: string
  dm_cta_text: string | null
  dm_cta_greeting: string | null
  dm_cta_enabled: boolean
}

type RuleRow = {
  id: string
  automation_id: string
  pattern: string
  flags: string | null
  created_at: string
}

type ActionRow = {
  id: string
  automation_id: string
  type: 'reply' | 'dm'
  template: string
  use_ai: boolean
  sort_order: number
  cta_text: string | null
  created_at: string
}

type ExecutionInsertRow = {
  owner_user_id: string
  event_id: string
  automation_id: string
  action_type: 'reply' | 'dm'
  action_id: string
  status: 'queued' | 'skipped'
  message_source: 'template' | 'ai' | null
  message_text: string | null
  recipient_ig_user_id: string | null
}

type QuickReplyPayload = {
  v: 1
  type: 'cta'
  eventId: string
  automationId: string
  actionId: string
  recipientId: string | null
}

function buildQuickReplyPayload(args: {
  eventId: string
  automationId: string
  actionId: string
  recipientId: string | null
}) {
  return JSON.stringify({
    v: 1,
    type: 'cta',
    eventId: args.eventId,
    automationId: args.automationId,
    actionId: args.actionId,
    recipientId: args.recipientId ?? null,
  } satisfies QuickReplyPayload)
}

function parseQuickReplyPayload(raw: unknown): QuickReplyPayload | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as QuickReplyPayload
    if (parsed?.type !== 'cta') return null
    if (!parsed.eventId || !parsed.automationId || !parsed.actionId) return null
    return parsed
  } catch {
    return null
  }
}

type ConnectionRow = {
  id: string
  owner_user_id: string
  access_token_encrypted: string
  ig_user_id: string | null
  meta_app_id: string | null
}

type MetaAppRow = {
  id: string
  meta_app_secret_encrypted: string | null
  webhook_verify_token_encrypted: string | null
  is_active: boolean
}

type MetaSecrets = {
  appSecret: string | null
  verifyToken: string | null
  metaAppId: string | null
}

function parseIntEnv(name: string, fallback: number) {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? Math.trunc(v) : fallback
}

function computeBackoffMs(attempts: number) {
  const minMs = parseIntEnv('WEBHOOK_BACKOFF_MIN_MS', 30_000)
  const maxMs = parseIntEnv('WEBHOOK_BACKOFF_MAX_MS', 6 * 60 * 60 * 1000)
  const exp = Math.min(20, Math.max(0, attempts))
  return Math.min(maxMs, minMs * Math.pow(2, exp))
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  try {
    return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort())
  } catch {
    return JSON.stringify(value)
  }
}

function decodeHex(value: string) {
  if (value.length % 2 !== 0) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < value.length; i += 2) {
    const chunk = value.slice(i, i + 2)
    const parsed = Number.parseInt(chunk, 16)
    if (!Number.isFinite(parsed)) return null
    bytes[i / 2] = parsed
  }
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message))
  return new Uint8Array(signature)
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  const bytes = new Uint8Array(digest)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeDedupeKey(payload: unknown): Promise<string> {
  try {
    const object = (payload as { object?: unknown })?.object ?? 'unknown'
    const entry = Array.isArray((payload as { entry?: unknown }).entry)
      ? ((payload as { entry?: unknown }).entry as Array<Record<string, unknown>>)
      : []

    const parts: string[] = [String(object)]

    for (const e of entry) {
      parts.push(String(e?.id ?? ''))
      const changes = Array.isArray((e as { changes?: unknown }).changes)
        ? (((e as { changes?: unknown }).changes as unknown) as Array<Record<string, unknown>>)
        : []
      for (const c of changes) {
        parts.push(String(c?.field ?? ''))
        const val = (c as { value?: unknown })?.value
        if (val && typeof val === 'object') {
          const record = val as Record<string, unknown>
          if ('id' in record) parts.push(String(record.id ?? ''))
          if ('comment_id' in record) parts.push(String(record.comment_id ?? ''))
          if ('media_id' in record) parts.push(String(record.media_id ?? ''))
        }
      }
    }

    const compact = parts.filter(Boolean).join('|')
    if (compact.length > 0 && compact !== 'unknown') return await sha256Hex(compact)
  } catch {
    // ignore
  }

  return await sha256Hex(stableStringify(payload))
}

async function verifyMetaSignature(args: {
  secret: string
  rawBody: string
  signatureHeader: string | null
}) {
  const header = args.signatureHeader
  if (!header) return false
  const prefix = 'sha256='
  const trimmed = header.trim()
  if (!trimmed.startsWith(prefix)) return false
  const theirHex = trimmed.slice(prefix.length).trim()
  if (!theirHex) return false

  const theirBytes = decodeHex(theirHex)
  if (!theirBytes) return false

  const ourBytes = await hmacSha256(args.secret, args.rawBody)
  return timingSafeEqual(ourBytes, theirBytes)
}

function extractMetaAppId(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean)
  const idx = segments.indexOf('instagram-webhook')
  if (idx === -1) return null
  return segments[idx + 1] ?? null
}

function rulesMatch(rules: RuleRow[], commentText: string): boolean {
  if (rules.length === 0) return true
  const hay = commentText.slice(0, 2000)
  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern, rule.flags ?? undefined)
      if (re.test(hay)) return true
    } catch {
      continue
    }
  }
  return false
}

async function resolveMetaAppSecrets(
  admin: ReturnType<typeof createAdminClient>,
  metaAppId: string | null,
): Promise<MetaSecrets> {
  if (!metaAppId) {
    return {
      appSecret: Deno.env.get('META_APP_SECRET') ?? null,
      verifyToken: Deno.env.get('IG_WEBHOOK_VERIFY_TOKEN') ?? null,
      metaAppId: null,
    }
  }

  if (!isUuid(metaAppId)) {
    return { appSecret: null, verifyToken: null, metaAppId }
  }

  const { data, error } = await admin
    .from('app_private.meta_apps')
    .select('id, meta_app_secret_encrypted, webhook_verify_token_encrypted, is_active')
    .eq('id', metaAppId)
    .maybeSingle()

  if (error || !data || !data.is_active) return { appSecret: null, verifyToken: null, metaAppId }

  const row = data as MetaAppRow
  const appSecret = row.meta_app_secret_encrypted ? await decryptString(row.meta_app_secret_encrypted) : null
  const verifyToken = row.webhook_verify_token_encrypted ? await decryptString(row.webhook_verify_token_encrypted) : null

  return { appSecret, verifyToken, metaAppId: row.id }
}

function parsePayload(rawBody: string) {
  if (!rawBody) return null
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    return null
  }
}

async function markExecutionStatus(args: {
  admin: ReturnType<typeof createAdminClient>
  eventId: string
  actionId: string
  status: 'succeeded' | 'failed' | 'awaiting_cta'
  attempts: number
  lastError: string | null
  messageText?: string | null
  messageSource?: 'template' | 'ai' | null
  aiError?: string | null
  aiModel?: string | null
  aiPromptVersion?: string | null
  aiLatencyMs?: number | null
}) {
  const updates: Record<string, unknown> = {
    status: args.status,
    attempts: args.attempts,
    last_error: args.lastError,
  }

  if (args.messageText !== undefined) updates.message_text = args.messageText
  if (args.messageSource !== undefined) updates.message_source = args.messageSource
  if (args.aiError !== undefined) updates.ai_error = args.aiError
  if (args.aiModel !== undefined) updates.ai_model = args.aiModel
  if (args.aiPromptVersion !== undefined) updates.ai_prompt_version = args.aiPromptVersion
  if (args.aiLatencyMs !== undefined) updates.ai_latency_ms = args.aiLatencyMs

  await args.admin
    .from('automation_executions')
    .update(updates)
    .eq('event_id', args.eventId)
    .eq('action_id', args.actionId)
}

function extractQuickReplyPayload(payload: unknown): { payload: string; senderId: string | null } | null {
  if (!payload || typeof payload !== 'object') return null
  const entry = (payload as { entry?: Array<Record<string, unknown>> })?.entry?.[0]
  const messaging = Array.isArray(entry?.messaging) ? entry?.messaging?.[0] : null
  if (!messaging || typeof messaging !== 'object') return null

  const senderId =
    typeof (messaging as Record<string, unknown>)?.sender === 'object'
      ? ((messaging as Record<string, unknown>).sender as Record<string, unknown>)?.id
      : null
  const message =
    typeof (messaging as Record<string, unknown>)?.message === 'object'
      ? ((messaging as Record<string, unknown>).message as Record<string, unknown>)
      : null
  const quickReply =
    message && typeof message.quick_reply === 'object'
      ? (message.quick_reply as Record<string, unknown>)
      : null
  const rawPayload = quickReply?.payload

  if (typeof rawPayload !== 'string' || !rawPayload.trim()) return null

  return {
    payload: rawPayload,
    senderId: typeof senderId === 'string' ? senderId : null,
  }
}

async function pickReplyAction(args: {
  actions: ActionRow[]
  eventId: string
  automationId: string
}): Promise<ActionRow | null> {
  const replyActions = args.actions.filter((action) => action.type === 'reply' && action.template.trim())
  if (replyActions.length === 0) return null
  if (replyActions.length === 1) return replyActions[0]

  const hash = await sha256Hex(`${args.eventId}:${args.automationId}`)
  const hashInt = Number.parseInt(hash.slice(0, 8), 16)
  const index = Number.isFinite(hashInt) && replyActions.length > 0
    ? hashInt % replyActions.length
    : 0
  return replyActions[index] ?? replyActions[0] ?? null
}

async function processExecutions(args: {
  admin: ReturnType<typeof createAdminClient>
  eventId: string
  connection: ConnectionRow
  parsed: ParsedCommentEvent
  automations: AutomationRow[]
  rulesByAutomation: Map<string, RuleRow[]>
  actionsByAutomation: Map<string, ActionRow[]>
}) {
  const executions: Array<{
    automationId: string
    action: ActionRow
    matched: boolean
  }> = []

  for (const automation of args.automations) {
    const rules = args.rulesByAutomation.get(automation.id) ?? []
    const actions = args.actionsByAutomation.get(automation.id) ?? []
    const matched = rulesMatch(rules, args.parsed.commentText)
    const selectedReply = await pickReplyAction({
      actions,
      eventId: args.eventId,
      automationId: automation.id,
    })

    for (const action of actions) {
      if (action.type === 'reply') {
        if (!selectedReply || action.id !== selectedReply.id) continue
      }
      executions.push({ automationId: automation.id, action, matched })
    }
  }

  if (executions.length === 0) return { matched: 0, attempted: 0, failed: 0 }

  const rows: ExecutionInsertRow[] = executions.map((execution) => ({
    owner_user_id: args.connection.owner_user_id,
    event_id: args.eventId,
    automation_id: execution.automationId,
    action_type: execution.action.type,
    action_id: execution.action.id,
    status: execution.matched ? 'queued' : 'skipped',
    message_source: null,
    message_text: null,
    recipient_ig_user_id: args.parsed.fromId,
  }))

  const { error: insertError } = await args.admin.from('automation_executions').upsert(rows, {
    onConflict: 'event_id,action_id',
    ignoreDuplicates: true,
  })

  if (insertError) {
    throw insertError
  }

  const { data: existingRows, error: existingError } = await args.admin
    .from('automation_executions')
    .select('action_id, status')
    .eq('event_id', args.eventId)

  if (existingError) {
    throw existingError
  }

  let accessToken: string | null = null
  try {
    accessToken = await decryptString(args.connection.access_token_encrypted)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decrypt access token'
    for (const execution of executions) {
      if (!execution.matched) continue
      await markExecutionStatus({
        admin: args.admin,
        eventId: args.eventId,
        actionId: execution.action.id,
        status: 'failed',
        attempts: 1,
        lastError: message,
      })
    }
    return { matched: 0, attempted: 0, failed: executions.length }
  }

  let matched = 0
  let attempted = 0
  let failed = 0

  const existingByActionId = new Map<string, { status: string }>()
  for (const row of (existingRows ?? []) as Array<{ action_id: string; status: string }>) {
    if (row?.action_id) existingByActionId.set(row.action_id, { status: row.status })
  }

  for (const execution of executions) {
    const existingStatus = existingByActionId.get(execution.action.id)?.status
    if (existingStatus === 'succeeded' || existingStatus === 'awaiting_cta') {
      continue
    }

    if (!execution.matched) continue
    matched += 1
    attempted += 1

    const template = execution.action.template.trim()
    if (!template) {
      await markExecutionStatus({
        admin: args.admin,
        eventId: args.eventId,
        actionId: execution.action.id,
        status: 'failed',
        attempts: 1,
        lastError: 'Action template missing',
      })
      failed += 1
      continue
    }

    let messageText = template
    let messageSource: 'template' | 'ai' = 'template'
    let aiError: string | null = null
    let aiModel: string | null = null
    let aiPromptVersion: string | null = null
    let aiLatencyMs: number | null = null

    const useAi = execution.action.type === 'reply' && execution.action.use_ai
    if (useAi) {
      const replyTemplates = (args.actionsByAutomation.get(execution.automationId) ?? [])
        .filter((action) => action.type === 'reply')
        .map((action) => action.template.trim())
        .filter(Boolean)
      const aiResult = await generateGeminiVariant({
        baseMessage: template,
        baseMessages: replyTemplates,
        commentText: args.parsed.commentText,
      })
      aiError = aiResult.error
      aiModel = aiResult.model
      aiPromptVersion = aiResult.promptVersion
      aiLatencyMs = aiResult.latencyMs

      if (aiResult.text) {
        messageText = aiResult.text
        messageSource = 'ai'
        aiError = null
      }
    }

    const dmCount = (args.actionsByAutomation.get(execution.automationId) ?? []).filter((a) => a.type === 'dm').length
    const automationConfig = args.automations.find((a) => a.id === execution.automationId)
    const shouldGate = execution.action.type === 'dm' && (dmCount > 1 || Boolean(automationConfig?.dm_cta_enabled))
    if (shouldGate) {
      continue
    }

    try {
      if (execution.action.type === 'reply') {
        await sendCommentReply({
          accessToken,
          commentId: args.parsed.commentId,
          message: messageText,
        })
      } else {
        if (!args.connection.ig_user_id) {
          throw new Error('Missing sender ig_user_id on connection (run resolve-connection)')
        }
        const mediaKind = (execution.action as any).media_kind as string | null | undefined
        const mediaBucket = (execution.action as any).media_bucket as string | null | undefined
        const mediaPath = (execution.action as any).media_path as string | null | undefined
        const caption = ((execution.action as any).caption as string | null | undefined) ?? null

        // If an image is configured for this automation action, attempt media DM first.
        // If Meta rejects attachments in private reply mode (comment_id), we fallback to text-only.
        if (mediaKind === 'image' && mediaBucket && mediaPath) {
          try {
            const { data: signed, error: signError } = await args.admin.storage
              .from(mediaBucket)
              .createSignedUrl(mediaPath, 60 * 5)
            if (signError || !signed?.signedUrl) {
              throw new Error(signError?.message || 'Failed to create signed URL')
            }

            await sendDmWithImage({
              accessToken,
              senderIgUserId: args.connection.ig_user_id,
              commentId: args.parsed.commentId,
              imageUrl: signed.signedUrl,
              caption: (caption || messageText || null) ?? null,
            })
          } catch (mediaErr) {
            console.warn('DM image send failed; falling back to text-only', mediaErr)
            await sendDm({
              accessToken,
              senderIgUserId: args.connection.ig_user_id,
              commentId: args.parsed.commentId,
              message: messageText,
            })
          }
        } else {
          await sendDm({
            accessToken,
            senderIgUserId: args.connection.ig_user_id,
            commentId: args.parsed.commentId,
            message: messageText,
          })
        }
      }

      if (!shouldGate) {
        await markExecutionStatus({
          admin: args.admin,
          eventId: args.eventId,
          actionId: execution.action.id,
          status: 'succeeded',
          attempts: 1,
          lastError: null,
          messageText,
          messageSource,
          aiError,
          aiModel,
          aiPromptVersion,
          aiLatencyMs,
        })
      }
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Execution failed'
      if (message === 'Execution failed') {
        message = 'Unknown error occurred'
      }
      if (error instanceof GraphError && error.payload) {
        try {
          message = `${message} | raw=${JSON.stringify(error.payload)}`
        } catch {
          message = `${message} | raw=[unserializable]`
        }
      }
      await markExecutionStatus({
        admin: args.admin,
        eventId: args.eventId,
        actionId: execution.action.id,
        status: 'failed',
        attempts: 1,
        lastError: message,
        messageText,
        messageSource,
        aiError,
        aiModel,
        aiPromptVersion,
        aiLatencyMs,
      })
      failed += 1
      if (error instanceof GraphError) {
        console.error('Instagram execution failed', { status: error.status, message })
      } else {
        console.error('Execution failed', error)
      }
    }
  }

  for (const automation of args.automations) {
    const actions = args.actionsByAutomation.get(automation.id) ?? []
    const dmActions = actions.filter((action) => action.type === 'dm')
    const shouldGate = dmActions.length > 1 || automation.dm_cta_enabled
    if (!shouldGate || dmActions.length === 0) continue

    const ctaGreeting = automation.dm_cta_greeting?.trim() || 'Thanks for your comment! Tap below to receive the messages.'
    const ctaText = automation.dm_cta_text?.trim() || 'Send me the rest'
    const payload = buildQuickReplyPayload({
      eventId: args.eventId,
      automationId: automation.id,
      actionId: dmActions[0]?.id ?? 'none',
      recipientId: args.parsed.fromId,
    })

    if (!args.connection.ig_user_id) continue
    const ctaStatus = args.parsed.fromId ? 'pending' : 'failed'
    const { data: ctaRow, error: ctaError } = await args.admin
      .from('automation_cta_sessions')
      .upsert({
        event_id: args.eventId,
        automation_id: automation.id,
        connection_id: args.connection.id,
        recipient_ig_user_id: args.parsed.fromId,
        payload,
        status: ctaStatus,
      }, {
        onConflict: 'event_id,automation_id',
      })
      .select('id')
      .maybeSingle()

    if (!ctaError && ctaRow) {
      await sendDm({
        accessToken,
        senderIgUserId: args.connection.ig_user_id,
        commentId: args.parsed.commentId,
        message: ctaGreeting,
        quickReplies: [{ title: ctaText, payload }],
      })
    }

    const awaitingStatus = args.parsed.fromId ? 'awaiting_cta' : 'failed'
    const awaitingError = args.parsed.fromId ? null : 'Missing recipient id for CTA'
    for (const action of dmActions) {
      await markExecutionStatus({
        admin: args.admin,
        eventId: args.eventId,
        actionId: action.id,
        status: awaitingStatus,
        attempts: 0,
        lastError: awaitingError,
      })
    }
  }

  return { matched, attempted, failed }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const url = new URL(req.url)
  const metaAppId = extractMetaAppId(url)
  const admin = createAdminClient()

  console.info('Instagram webhook request received', {
    method: req.method,
    pathname: url.pathname,
    hasMetaAppId: Boolean(metaAppId),
  })

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    console.info('Instagram webhook verification attempt', {
      mode,
      tokenProvided: Boolean(token),
      challengeLength: challenge?.length ?? 0,
      hasMetaAppId: Boolean(metaAppId),
    })

    const secrets = await resolveMetaAppSecrets(admin, metaAppId)
    if (metaAppId && !secrets.verifyToken) {
      console.warn('Instagram webhook verify token missing', { metaAppId })
      return errorResponse(404, 'Webhook configuration not found', req)
    }
    if (!metaAppId && !secrets.verifyToken) {
      console.warn('Instagram webhook verify token missing (env)', { hasMetaAppId: false })
      return errorResponse(500, 'Server not configured', req)
    }

    if (mode === 'subscribe' && token === secrets.verifyToken) {
      console.info('Instagram webhook verified', {
        metaAppId: secrets.metaAppId ?? metaAppId,
      })
      return new Response(String(challenge ?? ''), {
        status: 200,
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'text/plain',
        },
      })
    }

    console.warn('Instagram webhook verification failed', {
      mode,
      tokenProvided: Boolean(token),
      tokenMatch: token === secrets.verifyToken,
      verifyTokenConfigured: Boolean(secrets.verifyToken),
      metaAppId: secrets.metaAppId ?? metaAppId,
    })
    return errorResponse(403, 'Forbidden', req)
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  const rawBody = await req.text()
  const payload = parsePayload(rawBody)
  const parsed = extractCommentEvent(payload)
  const signatureHeader = req.headers.get('x-hub-signature-256')

  console.info('Instagram webhook payload received', {
    payloadBytes: rawBody.length,
    signaturePresent: Boolean(signatureHeader),
    hasMetaAppId: Boolean(metaAppId),
  })

  const secrets = await resolveMetaAppSecrets(admin, metaAppId)
  if (metaAppId && !secrets.appSecret) {
    console.warn('Instagram webhook app secret missing', { metaAppId })
    return errorResponse(404, 'Webhook configuration not found', req)
  }
  if (!metaAppId && !secrets.appSecret) {
    console.warn('Instagram webhook app secret missing (env)', { hasMetaAppId: false })
    return errorResponse(500, 'Server not configured', req)
  }
  const okSig = await verifyMetaSignature({
    secret: secrets.appSecret ?? '',
    rawBody,
    signatureHeader,
  })

  if (!okSig) {
    console.warn('Instagram webhook signature invalid', {
      signaturePresent: Boolean(signatureHeader),
      metaAppId: secrets.metaAppId ?? metaAppId,
    })
    return errorResponse(401, 'Invalid signature', req)
  }

  if (!parsed) {
    const quickReply = extractQuickReplyPayload(payload)
    const cta = parseQuickReplyPayload(quickReply?.payload)
    if (!cta) {
      console.info('Instagram webhook ignored', { reason: 'no-comment-event' })
      return jsonResponse({ ok: true }, 200, req)
    }

    const payloadString = quickReply?.payload ?? ''
    const { data: ctaSession, error: ctaError } = await admin
      .from('automation_cta_sessions')
      .select('id, event_id, automation_id, connection_id, status, recipient_ig_user_id')
      .eq('event_id', cta.eventId)
      .eq('automation_id', cta.automationId)
      .maybeSingle()

    if (ctaError || !ctaSession) {
      console.info('CTA interaction ignored', { reason: 'cta-session-not-found' })
      return jsonResponse({ ok: true }, 200, req)
    }

    if (ctaSession.status !== 'pending') {
      console.info('CTA interaction ignored', { reason: 'cta-already-processed' })
      return jsonResponse({ ok: true }, 200, req)
    }

    const { data: claimedCta, error: claimError } = await admin
      .from('automation_cta_sessions')
      .update({ status: 'processing' })
      .eq('id', ctaSession.id)
      .eq('status', 'pending')
      .select('id, payload')
      .maybeSingle()

    if (claimError || !claimedCta) {
      console.info('CTA interaction ignored', { reason: 'cta-already-claimed' })
      return jsonResponse({ ok: true }, 200, req)
    }

    if (claimedCta.payload && claimedCta.payload !== payloadString) {
      console.info('CTA interaction ignored', { reason: 'cta-payload-mismatch' })
      return jsonResponse({ ok: true }, 200, req)
    }

    const { data: connectionRow, error: connectionError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id, access_token_encrypted, ig_user_id')
      .eq('id', ctaSession.connection_id)
      .maybeSingle()

    if (connectionError || !connectionRow) {
      console.error('CTA interaction failed to load connection', connectionError)
      return jsonResponse({ ok: true }, 200, req)
    }

    const { data: actions, error: actionsError } = await admin
      .from('automation_actions')
      .select('id, automation_id, type, template, use_ai, sort_order, created_at, cta_text, media_kind, media_bucket, media_path, caption')
      .eq('automation_id', cta.automationId)
      .order('sort_order', { ascending: true })

    if (actionsError) {
      console.error('CTA interaction failed to load actions', actionsError)
      return jsonResponse({ ok: true }, 200, req)
    }

    let accessToken: string | null = null
    try {
      accessToken = await decryptString(connectionRow.access_token_encrypted)
    } catch (error) {
      console.error('CTA interaction failed to decrypt access token', error)
      return jsonResponse({ ok: true }, 200, req)
    }

    const recipientId = cta.recipientId ?? quickReply?.senderId ?? null
    if (ctaSession.recipient_ig_user_id && recipientId && ctaSession.recipient_ig_user_id !== recipientId) {
      console.info('CTA interaction ignored', { reason: 'recipient-mismatch' })
      return jsonResponse({ ok: true }, 200, req)
    }

    const dmActions = (actions ?? []).filter((action) => action.type === 'dm') as ActionRow[]
    const remaining = dmActions

    for (const action of remaining) {
      if (!action.template.trim()) continue
      if (!connectionRow.ig_user_id || !recipientId) continue

      const mediaKind = (action as any).media_kind as string | null | undefined
      const mediaBucket = (action as any).media_bucket as string | null | undefined
      const mediaPath = (action as any).media_path as string | null | undefined
      const caption = ((action as any).caption as string | null | undefined) ?? null

      try {
        const { data: existingExec, error: existingExecError } = await admin
          .from('automation_executions')
          .select('status')
          .eq('event_id', cta.eventId)
          .eq('action_id', action.id)
          .maybeSingle()

        if (existingExecError) {
          console.error('CTA interaction failed to load execution', existingExecError)
        } else if (existingExec?.status === 'succeeded') {
          continue
        }

        // CTA phase: send the DM content after the user explicitly clicked the CTA.
        // If this action has an image configured, attempt media delivery here (not before CTA).
        if (mediaKind === "image" && mediaBucket && mediaPath) {
          try {
            const { data: signed, error: signError } = await admin.storage
              .from(mediaBucket)
              .createSignedUrl(mediaPath, 60 * 5)
            if (signError || !signed?.signedUrl) {
              throw new Error(signError?.message || "Failed to create signed URL")
            }

            // Send caption/text first (if provided), then send the image as a follow-up message.
            const text = (caption || action.template.trim()).trim()
            if (text) {
              await sendRecipientDm({
                accessToken,
                senderIgUserId: connectionRow.ig_user_id,
                recipientId,
                message: text,
              })
            }

            await sendRecipientDmWithImage({
              accessToken,
              senderIgUserId: connectionRow.ig_user_id,
              recipientId,
              imageUrl: signed.signedUrl,
            })
          } catch (mediaErr) {
            console.warn("CTA DM image send failed; falling back to text-only", mediaErr)
            await sendRecipientDm({
              accessToken,
              senderIgUserId: connectionRow.ig_user_id,
              recipientId,
              message: action.template.trim(),
            })
          }
        } else {
          await sendRecipientDm({
            accessToken,
            senderIgUserId: connectionRow.ig_user_id,
            recipientId,
            message: action.template.trim(),
          })
        }
        await markExecutionStatus({
          admin,
          eventId: cta.eventId,
          actionId: action.id,
          status: 'succeeded',
          attempts: 1,
          lastError: null,
          messageText: action.template.trim(),
          messageSource: 'template',
        })
      } catch (error) {
        let message = error instanceof Error ? error.message : 'Execution failed'
        if (message === 'Execution failed') message = 'Unknown error occurred'
        await markExecutionStatus({
          admin,
          eventId: cta.eventId,
          actionId: action.id,
          status: 'failed',
          attempts: 1,
          lastError: message,
          messageText: action.template.trim(),
          messageSource: 'template',
        })
      }
    }

    await admin
      .from('automation_cta_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', ctaSession.id)

    return jsonResponse({ ok: true }, 200, req)
  }

  if (isReplyComment(parsed)) {
    console.info('Instagram webhook ignored', {
      reason: 'comment-reply',
      commentId: parsed.commentId,
      igPostId: parsed.igPostId,
    })
    return jsonResponse({ ok: true }, 200, req)
  }

  if (isSelfComment(parsed)) {
    console.info('Instagram webhook ignored', {
      reason: 'self-comment',
      commentId: parsed.commentId,
      igPostId: parsed.igPostId,
    })
    return jsonResponse({ ok: true }, 200, req)
  }

  const dedupeKey = await computeDedupeKey(payload)

  const { data: automations, error: automationError } = await admin
    .from('automations')
    .select('id, owner_user_id, connection_id, dm_cta_text, dm_cta_greeting, dm_cta_enabled')
    .eq('ig_post_id', parsed.igPostId)
    .eq('enabled', true)

  if (automationError) {
    console.error('Failed to load automations for webhook', automationError)
    return errorResponse(500, 'Unable to process webhook', req)
  }

  if (!automations || automations.length === 0) {
    console.info('Instagram webhook no automations', { igPostId: parsed.igPostId })
    return jsonResponse({ ok: true }, 200, req)
  }

  const automationIds = automations.map((automation) => automation.id)
  const [{ data: rules, error: rulesError }, { data: actions, error: actionsError }] = await Promise.all([
    admin
      .from('automation_rules')
      .select('id, automation_id, pattern, flags, created_at')
      .in('automation_id', automationIds),
    admin
      .from('automation_actions')
      .select('id, automation_id, type, template, use_ai, sort_order, cta_text, created_at')
      .in('automation_id', automationIds),
  ])

  if (rulesError) {
    console.error('Failed to load automation rules for webhook', rulesError)
    return errorResponse(500, 'Unable to process webhook', req)
  }

  if (actionsError) {
    console.error('Failed to load automation actions for webhook', actionsError)
    return errorResponse(500, 'Unable to process webhook', req)
  }

  const connectionIds = Array.from(new Set(automations.map((automation) => automation.connection_id)))
  let connectionsQuery = admin
    .from('instagram_connections')
    .select('id, owner_user_id, access_token_encrypted, ig_user_id, meta_app_id')
    .in('id', connectionIds)

  if (secrets.metaAppId) {
    connectionsQuery = connectionsQuery.eq('meta_app_id', secrets.metaAppId)
  }

  const { data: connections, error: connectionsError } = await connectionsQuery

  if (connectionsError) {
    console.error('Failed to load connections for webhook', connectionsError)
    return errorResponse(500, 'Unable to process webhook', req)
  }

  const connectionsById = new Map<string, ConnectionRow>()
  for (const connection of connections ?? []) {
    connectionsById.set(connection.id, connection as ConnectionRow)
  }

  const rulesByAutomation = new Map<string, RuleRow[]>()
  for (const rule of rules ?? []) {
    const list = rulesByAutomation.get(rule.automation_id) ?? []
    list.push(rule as RuleRow)
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    rulesByAutomation.set(rule.automation_id, list)
  }

  const actionsByAutomation = new Map<string, ActionRow[]>()
  for (const action of actions ?? []) {
    const list = actionsByAutomation.get(action.automation_id) ?? []
    list.push(action as ActionRow)
    list.sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      return orderDiff !== 0 ? orderDiff : a.created_at.localeCompare(b.created_at)
    })
    actionsByAutomation.set(action.automation_id, list)
  }

  const automationsByConnection = new Map<string, AutomationRow[]>()
  for (const automation of automations as AutomationRow[]) {
    const connection = connectionsById.get(automation.connection_id)
    if (!connection) continue
    if (automation.owner_user_id !== connection.owner_user_id) continue

    const list = automationsByConnection.get(connection.id) ?? []
    list.push(automation)
    automationsByConnection.set(connection.id, list)
  }

  if (automationsByConnection.size === 0) {
    console.info('Instagram webhook no eligible connections', { igPostId: parsed.igPostId })
    return jsonResponse({ ok: true }, 200, req)
  }

  for (const [connectionId, connectionAutomations] of automationsByConnection.entries()) {
    const connection = connectionsById.get(connectionId)
    if (!connection) continue

    const { data: eventRows, error: eventError } = await admin
      .from('instagram_webhook_events')
      .upsert(
        {
          owner_user_id: connection.owner_user_id,
          connection_id: connection.id,
          meta_app_id: connection.meta_app_id,
          dedupe_key: dedupeKey,
          payload: payload ?? null,
          status: 'processing',
          attempts: 0,
          received_at: new Date().toISOString(),
        },
        {
          onConflict: 'connection_id,dedupe_key',
          ignoreDuplicates: true,
        },
      )
      .select('id')

    if (eventError) {
      console.error('Failed to persist webhook event', eventError)
      return errorResponse(500, 'Unable to process webhook', req)
    }

    const eventId = eventRows?.[0]?.id
    if (!eventId) continue

    console.info('Instagram webhook event stored', {
      eventId,
      connectionId: connection.id,
      igPostId: parsed.igPostId,
    })

    try {
      const result = await processExecutions({
        admin,
        eventId,
        connection,
        parsed,
        automations: connectionAutomations,
        rulesByAutomation,
        actionsByAutomation,
      })

      console.info('Instagram webhook executions complete', {
        eventId,
        connectionId: connection.id,
        matched: result.matched,
        attempted: result.attempted,
        failed: result.failed,
      })

      await admin
        .from('instagram_webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          last_error: null,
        })
        .eq('id', eventId)
    } catch (error) {
      const attempts = 1
      const nextAttemptAt = new Date(Date.now() + computeBackoffMs(attempts)).toISOString()
      const message = error instanceof Error ? error.message : 'Webhook processing failed'

      await admin
        .from('instagram_webhook_events')
        .update({
          status: 'failed',
          attempts,
          last_error: message,
          next_attempt_at: nextAttemptAt,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', eventId)

      console.error('Webhook processing failed', {
        eventId,
        connectionId: connection.id,
        error,
      })
    }
  }

  return jsonResponse({ ok: true }, 200, req)
})
