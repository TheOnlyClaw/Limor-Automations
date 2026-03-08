import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../_shared/crypto.ts'
import { generateGeminiVariant } from '../_shared/gemini.ts'
import { sendCommentReply, sendDm } from '../_shared/instagramActions.ts'
import { GraphError } from '../_shared/instagramGraph.ts'
import { requireUser } from '../_shared/auth.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { extractCommentEvent, isReplyComment, isSelfComment } from '../_shared/webhook.ts'

type RetryExecutionBody = {
  executionId?: string
}

type ExecutionRow = {
  id: string
  event_id: string
  automation_id: string
  action_type: 'reply' | 'dm'
  action_id: string
  attempts: number
  status: 'queued' | 'failed' | 'skipped' | 'succeeded' | 'awaiting_cta'
  updated_at: string
  message_text: string | null
  message_source: 'template' | 'ai' | null
  owner_user_id: string
  recipient_ig_user_id: string | null
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
  id: string
  automation_id: string
  type: 'reply' | 'dm'
  template: string
  use_ai: boolean
  sort_order: number
  created_at: string
}

type ConnectionRow = {
  id: string
  access_token_encrypted: string
  ig_user_id: string | null
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

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as RetryExecutionBody | null
    const executionId = body?.executionId?.trim()

    if (!executionId) return errorResponse(400, 'executionId is required', req)

    const admin = createAdminClient()
    const { data: execution, error: executionError } = await admin
      .from('automation_executions')
      .select('id, event_id, automation_id, action_type, action_id, attempts, status, updated_at, message_text, message_source, owner_user_id, recipient_ig_user_id')
      .eq('id', executionId)
      .maybeSingle()

    if (executionError) {
      console.error('Failed to load execution for retry', executionError)
      return errorResponse(500, 'Unable to retry execution', req)
    }

    if (!execution) return errorResponse(404, 'Execution not found', req)
    if ((execution as ExecutionRow).owner_user_id !== user.id) return errorResponse(404, 'Execution not found', req)

    const executionRow = execution as ExecutionRow

    const { data: event, error: eventError } = await admin
      .from('instagram_webhook_events')
      .select('id, payload')
      .eq('id', executionRow.event_id)
      .maybeSingle()

    if (eventError) {
      console.error('Failed to load webhook event for retry', eventError)
      return errorResponse(500, 'Unable to retry execution', req)
    }

    if (!event) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: 'Webhook event not found',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
    }

    const parsed = extractCommentEvent((event as EventRow).payload)
    if (!parsed) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: 'Unsupported webhook payload for execution',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
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
        executionId: executionRow.id,
        status: 'skipped',
        attempts: executionRow.attempts + 1,
        lastError: ignoreReason,
      })
      return jsonResponse({ status: 'skipped' }, 200, req)
    }

    const [automationRes, actionRes, replyActionsRes] = await Promise.all([
      admin
        .from('automations')
        .select('id, connection_id')
        .eq('id', executionRow.automation_id)
        .maybeSingle(),
      admin
        .from('automation_actions')
        .select('id, automation_id, type, template, use_ai, sort_order, created_at')
        .eq('id', executionRow.action_id)
        .maybeSingle(),
      admin
        .from('automation_actions')
        .select('id, automation_id, type, template, use_ai, sort_order, created_at')
        .eq('automation_id', executionRow.automation_id)
        .eq('type', 'reply')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (automationRes.error) {
      console.error('Failed to load automation for retry', automationRes.error)
      return errorResponse(500, 'Unable to retry execution', req)
    }

    if (actionRes.error) {
      console.error('Failed to load action for retry', actionRes.error)
      return errorResponse(500, 'Unable to retry execution', req)
    }

    if (replyActionsRes.error) {
      console.error('Failed to load reply actions for retry', replyActionsRes.error)
    }

    if (!automationRes.data) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: 'Automation not found',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
    }

    if (!actionRes.data || !(actionRes.data as ActionRow).template.trim()) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: 'Action template missing',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
    }

    if (executionRow.status === 'awaiting_cta') {
      return jsonResponse({ status: 'awaiting_cta' }, 200, req)
    }

    const action = actionRes.data as ActionRow
    const automation = automationRes.data as AutomationRow
    const replyTemplates = (replyActionsRes.data ?? [])
      .map((item) => (item as ActionRow).template.trim())
      .filter(Boolean)

    const { data: connection, error: connectionError } = await admin
      .from('instagram_connections')
      .select('id, access_token_encrypted, ig_user_id')
      .eq('id', automation.connection_id)
      .maybeSingle()

    if (connectionError) {
      console.error('Failed to load connection for retry', connectionError)
      return errorResponse(500, 'Unable to retry execution', req)
    }

    if (!connection) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: 'Connection not found',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
    }

    const storedMessage = executionRow.message_text?.trim() ?? ''
    let messageText = storedMessage
    let messageSource = executionRow.message_source ?? null
    let aiError: string | null = null
    let aiModel: string | null = null
    let aiPromptVersion: string | null = null
    let aiLatencyMs: number | null = null

    const useAi = executionRow.action_type === 'reply' && action.use_ai
    if (!messageText) {
      const template = action.template.trim()
      if (useAi) {
        const aiResult = await generateGeminiVariant({
          baseMessage: template,
          baseMessages: replyTemplates,
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

    let accessToken: string
    try {
      accessToken = await decryptString((connection as ConnectionRow).access_token_encrypted)
    } catch (error) {
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Failed to decrypt access token',
      })
      return jsonResponse({ status: 'failed' }, 200, req)
    }

    try {
      if (executionRow.action_type === 'reply') {
        await sendCommentReply({
          accessToken,
          commentId: parsed.commentId,
          message: messageText,
        })
      } else {
        if (!(connection as ConnectionRow).ig_user_id) {
          throw new Error('Missing sender ig_user_id on connection (run resolve-connection)')
        }
        await sendDm({
          accessToken,
          senderIgUserId: (connection as ConnectionRow).ig_user_id as string,
          commentId: parsed.commentId,
          message: messageText,
        })
      }

      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'succeeded',
        attempts: executionRow.attempts + 1,
        lastError: null,
        messageText,
        messageSource,
        aiError,
        aiModel,
        aiPromptVersion,
        aiLatencyMs,
      })

      return jsonResponse({ status: 'succeeded' }, 200, req)
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
      await markExecution({
        admin,
        executionId: executionRow.id,
        status: 'failed',
        attempts: executionRow.attempts + 1,
        lastError: message,
        messageText,
        messageSource,
        aiError,
        aiModel,
        aiPromptVersion,
        aiLatencyMs,
      })

      if (error instanceof GraphError) {
        console.error('Instagram execution failed', { status: error.status, message })
      } else {
        console.error('Execution failed', error)
      }

      return jsonResponse({ status: 'failed' }, 200, req)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message, req)
  }
})
