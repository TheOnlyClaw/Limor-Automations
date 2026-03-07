import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { ApiError } from '../lib/api'
import { requireAuthenticatedUser, supabase } from '../lib/supabase'

export type InstagramPost = {
  id: string
  caption: string | null
  mediaType: string
  mediaUrl: string | null
  permalink: string | null
  timestamp: string | null
  thumbnailUrl: string | null
}

type ListInstagramPostsInput = {
  connectionId: string
  limit?: number
}

function toApiError(message: string, status = 500) {
  return new ApiError(status, message)
}

export async function listInstagramPosts(params: ListInstagramPostsInput): Promise<{ items: InstagramPost[] }> {
  await requireAuthenticatedUser()
  const { data, error } = await supabase.functions.invoke('list-instagram-posts', {
    body: {
      connectionId: params.connectionId,
      ...(params.limit ? { limit: params.limit } : {}),
    },
  })

  if (!error) return data as { items: InstagramPost[] }

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
