import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../_shared/crypto.ts'
import { generateGeminiVariant } from '../_shared/gemini.ts'
import { sendCommentReply, sendDm } from '../_shared/instagramActions.ts'
import { GraphError } from '../_shared/instagramGraph.ts'
import { requireUser } from '../_shared/auth.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { extractCommentEvent, isReplyComment, isSelfComment } from '../_shared/webhook.ts'

declare const Deno: any

type ExecutionRow = {
  id: string
  event_id: string
  automation_id: string
  action_type: 'reply' | 'dm'
  attempts: number
  status: 'queued' | 'failed' | 'skipped'
  updated_at: string
  message_text: string | null
  message_source: 'template' | 'ai' | null
}

type EventRow = {
  id: string
  payload: unknown
}

type AutomationRow = {
  id: string
  connection_id: string
}

type ActionRow = {
  automation_id: string
  type: 'reply' | 'dm'
  template: string
  use_ai: boolean
  created_at: string
}

type ConnectionRow = {
  id: string
  access_token_encrypted: string
  ig_user_id: string | null
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

function parseIsoMs(value: string | null) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

async function markExecution(args: {
  admin: ReturnType<typeof createAdminClient>
  executionId: string
  status: 'succeeded' | 'failed' | 'skipped'
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
    .eq('id', args.executionId)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    await requireUser(req)
  } catch (error) {
    return errorResponse(401, error instanceof Error ? error.message : 'Unauthorized')
  }

  const admin = createAdminClient()
  const batchSize = parseIntEnv('EXECUTION_RETRY_BATCH_SIZE', 20)
  const maxAttempts = parseIntEnv('EXECUTION_RETRY_MAX_ATTEMPTS', 8)

  const { data: rows, error } = await admin
    .from('automation_executions')
    .select('id, event_id, automation_id, action_type, attempts, status, updated_at, message_text, message_source')
    .in('status', ['queued', 'failed'])
    .order('updated_at', { ascending: true })
    .limit(Math.max(batchSize * 3, batchSize))

  if (error) {
    console.error('Failed to load executions for retry', error)
    return errorResponse(500, 'Unable to retry executions')
  }

  const nowMs = Date.now()
  const candidates = (rows ?? []).filter((row) => {
    if (row.status === 'queued') return true
    if (row.attempts >= maxAttempts) return false
    const updatedMs = parseIsoMs(row.updated_at)
    if (updatedMs === null) return true
    return nowMs - updatedMs >= computeBackoffMs(row.attempts)
  })

  const work = candidates.slice(0, batchSize) as ExecutionRow[]
  if (work.length === 0) return jsonResponse({ attempted: 0, succeeded: 0, failed: 0 })

  const eventIds = Array.from(new Set(work.map((row) => row.event_id)))
  const automationIds = Array.from(new Set(work.map((row) => row.automation_id)))

  const [eventsRes, automationsRes, actionsRes] = await Promise.all([
    admin.from('instagram_webhook_events').select('id, payload').in('id', eventIds),
    admin.from('automations').select('id, connection_id').in('id', automationIds),
    admin
      .from('automation_actions')
      .select('automation_id, type, template, use_ai, created_at')
      .in('automation_id', automationIds),
  ])

  if (eventsRes.error) {
    console.error('Failed to load webhook events for retry', eventsRes.error)
    return errorResponse(500, 'Unable to retry executions')
  }

  if (automationsRes.error) {
    console.error('Failed to load automations for retry', automationsRes.error)
    return errorResponse(500, 'Unable to retry executions')
  }

  if (actionsRes.error) {
    console.error('Failed to load actions for retry', actionsRes.error)
    return errorResponse(500, 'Unable to retry executions')
  }

  const automationsById = new Map<string, AutomationRow>()
  for (const automation of automationsRes.data ?? []) {
    automationsById.set(automation.id, automation as AutomationRow)
  }

  const connectionIds = Array.from(
    new Set((automationsRes.data ?? []).map((automation) => (automation as AutomationRow).connection_id)),
  )

  const { data: connections, error: connectionsError } = await admin
    .from('instagram_connections')
    .select('id, access_token_encrypted, ig_user_id')
    .in('id', connectionIds)

  if (connectionsError) {
    console.error('Failed to load connections for retry', connectionsError)
    return errorResponse(500, 'Unable to retry executions')
  }

  const connectionsById = new Map<string, ConnectionRow>()
  for (const connection of connections ?? []) {
    connectionsById.set(connection.id, connection as ConnectionRow)
  }

  const actionsByKey = new Map<string, ActionRow>()
  const sortedActions = [...(actionsRes.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const action of sortedActions) {
    const key = `${action.automation_id}:${action.type}`
    if (!actionsByKey.has(key)) actionsByKey.set(key, action as ActionRow)
  }

  const eventsById = new Map<string, EventRow>()
  for (const event of eventsRes.data ?? []) {
    eventsById.set(event.id, event as EventRow)
  }

  let attempted = 0
  let succeeded = 0
  let failed = 0

  for (const execution of work) {
    const event = eventsById.get(execution.event_id)
    if (!event) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: 'Webhook event not found',
      })
      failed += 1
      continue
    }

    const parsed = extractCommentEvent(event.payload)
    if (!parsed) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: 'Unsupported webhook payload for execution',
      })
      failed += 1
      continue
    }

    let ignoreReason: string | null = null
    if (isReplyComment(parsed)) {
      ignoreReason = 'Reply comment ignored'
    } else if (isSelfComment(parsed)) {
      ignoreReason = 'Self comment ignored'
    }

    if (ignoreReason) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'skipped',
        attempts: execution.attempts + 1,
        lastError: ignoreReason,
      })
      continue
    }

    const automation = automationsById.get(execution.automation_id)
    if (!automation) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: 'Automation not found',
      })
      failed += 1
      continue
    }

    const action = actionsByKey.get(`${execution.automation_id}:${execution.action_type}`)
    if (!action || !action.template.trim()) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: 'Action template missing',
      })
      failed += 1
      continue
    }

    const storedMessage = execution.message_text?.trim() ?? ''
    let messageText = storedMessage
    let messageSource = execution.message_source ?? null
    let aiError: string | null = null
    let aiModel: string | null = null
    let aiPromptVersion: string | null = null
    let aiLatencyMs: number | null = null

    const useAi = execution.action_type === 'reply' && action.use_ai
    if (!messageText) {
      const template = action.template.trim()
      if (useAi) {
        const aiResult = await generateGeminiVariant({
          baseMessage: template,
          commentText: parsed.commentText,
        })
        aiError = aiResult.error
        aiModel = aiResult.model
        aiPromptVersion = aiResult.promptVersion
        aiLatencyMs = aiResult.latencyMs

        if (aiResult.text) {
          messageText = aiResult.text
          messageSource = 'ai'
          aiError = null
        } else {
          messageText = template
          messageSource = 'template'
        }
      } else {
        messageText = template
        messageSource = 'template'
      }
    }

    if (!messageSource) {
      messageSource = useAi ? 'ai' : 'template'
    }

    const connection = connectionsById.get(automation.connection_id)
    if (!connection) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: 'Connection not found',
      })
      failed += 1
      continue
    }

    let accessToken: string
    try {
      accessToken = await decryptString(connection.access_token_encrypted)
    } catch (error) {
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Failed to decrypt access token',
      })
      failed += 1
      continue
    }

    attempted += 1

    try {
      if (execution.action_type === 'reply') {
        await sendCommentReply({
          accessToken,
          commentId: parsed.commentId,
          message: messageText,
        })
      } else {
        if (!connection.ig_user_id) {
          throw new Error('Missing sender ig_user_id on connection (run resolve-connection)')
        }
        await sendDm({
          accessToken,
          senderIgUserId: connection.ig_user_id,
          commentId: parsed.commentId,
          message: messageText,
        })
      }

      await markExecution({
        admin,
        executionId: execution.id,
        status: 'succeeded',
        attempts: execution.attempts + 1,
        lastError: null,
        messageText,
        messageSource,
        aiError,
        aiModel,
        aiPromptVersion,
        aiLatencyMs,
      })
      succeeded += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed'
      await markExecution({
        admin,
        executionId: execution.id,
        status: 'failed',
        attempts: execution.attempts + 1,
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

  return jsonResponse({ attempted, succeeded, failed })
})
