import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { createAdminClient } from '../_shared/supabase.ts'

type ListFailedExecutionsBody = {
  postId?: string
}

type FailedExecutionRow = {
  id: string
  action_type: 'reply' | 'dm'
  attempts: number
  last_error: string | null
  updated_at: string
  message_text: string | null
  message_source: 'template' | 'ai' | null
  event_id: string
}

type AutomationRow = {
  id: string
  owner_user_id: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as ListFailedExecutionsBody | null
    const postId = body?.postId?.trim()

    if (!postId) return errorResponse(400, 'postId is required', req)

    const admin = createAdminClient()
    const { data: automation, error: automationError } = await admin
      .from('automations')
      .select('id, owner_user_id')
      .eq('ig_post_id', postId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (automationError) {
      console.error('Failed to load automation for failed executions', automationError)
      return errorResponse(500, 'Unable to list failed executions', req)
    }

    if (!automation) {
      return jsonResponse({ items: [] }, 200, req)
    }

    if ((automation as AutomationRow).owner_user_id !== user.id) {
      return errorResponse(404, 'Automation not found', req)
    }

    const { data: executions, error: executionsError } = await admin
      .from('automation_executions')
      .select('id, action_type, attempts, last_error, updated_at, message_text, message_source, event_id')
      .eq('automation_id', (automation as AutomationRow).id)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })

    if (executionsError) {
      console.error('Failed to load failed executions', executionsError)
      return errorResponse(500, 'Unable to list failed executions', req)
    }

    const eventIds = Array.from(new Set((executions ?? []).map((row) => (row as FailedExecutionRow).event_id)))
    const eventUsernames = new Map<string, string | null>()

    if (eventIds.length > 0) {
      const { data: events, error: eventsError } = await admin
        .from('instagram_webhook_events')
        .select('id, payload')
        .in('id', eventIds)

      if (eventsError) {
        console.error('Failed to load webhook events for failed executions', eventsError)
      } else {
        for (const event of events ?? []) {
          const payload = (event as { payload?: Record<string, unknown> }).payload
          let username: string | null = null
          if (payload && typeof payload === 'object') {
            const entry = (payload as { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> })
              .entry?.[0]
            const change = entry?.changes?.[0]
            const value = change?.value
            const from = value?.from as Record<string, unknown> | undefined
            const raw = from?.username ?? (value as Record<string, unknown> | undefined)?.username
            if (typeof raw === 'string' && raw.trim()) username = raw.trim()
          }
          eventUsernames.set((event as { id: string }).id, username)
        }
      }
    }

    const items = (executions ?? []).map((row) => {
      const execution = row as FailedExecutionRow
      return {
        id: execution.id,
        actionType: execution.action_type,
        attempts: execution.attempts,
        lastError: execution.last_error,
        updatedAt: execution.updated_at,
        messageText: execution.message_text,
        messageSource: execution.message_source,
        recipientUsername: eventUsernames.get(execution.event_id) ?? null,
      }
    })

    return jsonResponse({ items }, 200, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message, req)
  }
})
