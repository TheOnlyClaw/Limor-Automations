import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { ApiError } from '../lib/api'
import { requireAuthenticatedUser, supabase } from '../lib/supabase'

export type FailedExecution = {
  id: string
  actionType: 'reply' | 'dm'
  attempts: number
  lastError: string | null
  updatedAt: string
  messageText: string | null
  messageSource: 'template' | 'ai' | null
  recipientUsername: string | null
}

type ListFailedExecutionsInput = {
  postId: string
}

type RetryExecutionInput = {
  executionId: string
}

type ListFailedExecutionsResponse = {
  items: FailedExecution[]
}

type RetryExecutionResponse = {
  status: 'succeeded' | 'failed' | 'skipped'
}

function toApiError(message: string, status = 500) {
  return new ApiError(status, message)
}

async function invokeFailedExecutionsFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  await requireAuthenticatedUser()
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null)
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : error.message
    throw toApiError(message, error.context.status)
  }

  if (error instanceof FunctionsRelayError) {
    throw toApiError('Supabase relay error while calling Edge Function', 502)
  }

  if (error instanceof FunctionsFetchError) {
    throw toApiError('Unable to reach the Edge Function', 503)
  }

  throw toApiError(error.message)
}

export async function listFailedExecutions(
  params: ListFailedExecutionsInput,
): Promise<ListFailedExecutionsResponse> {
  return invokeFailedExecutionsFunction<ListFailedExecutionsResponse>('list-post-failed-executions', {
    postId: params.postId,
  })
}

export async function retryFailedExecution(
  params: RetryExecutionInput,
): Promise<RetryExecutionResponse> {
  return invokeFailedExecutionsFunction<RetryExecutionResponse>('retry-automation-execution', {
    executionId: params.executionId,
  })
}
