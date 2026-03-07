import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { ApiError } from '../lib/api'
import { requireAuthenticatedUser, supabase } from '../lib/supabase'
import type {
  CreateInstagramConnectionInput,
  InstagramConnection,
  UpdateInstagramConnectionInput,
} from './types'

type InstagramConnectionRow = {
  id: string
  label: string | null
  ig_user_id: string | null
  page_id: string | null
  token_expires_at: string | null
  last_refreshed_at: string | null
  refresh_status: string | null
  refresh_error: string | null
  connection_status: 'active' | 'reauth_required' | 'disabled'
  created_at: string
  updated_at: string
}

const safeConnectionSelect = [
  'id',
  'label',
  'ig_user_id',
  'page_id',
  'token_expires_at',
  'last_refreshed_at',
  'refresh_status',
  'refresh_error',
  'connection_status',
  'created_at',
  'updated_at',
].join(', ')

function toConnection(row: InstagramConnectionRow): InstagramConnection {
  return {
    id: row.id,
    label: row.label,
    igUserId: row.ig_user_id,
    pageId: row.page_id,
    expiresAt: row.token_expires_at,
    lastRefreshedAt: row.last_refreshed_at,
    refreshStatus: row.refresh_status,
    refreshError: row.refresh_error,
    connectionStatus: row.connection_status,
    hasStoredAccessToken: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toApiError(message: string, status = 500) {
  return new ApiError(status, message)
}

async function invokeConnectionFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
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

export async function listInstagramConnections(): Promise<InstagramConnection[]> {
  const { data, error } = await supabase
    .from('instagram_connections')
    .select(safeConnectionSelect)
    .order('created_at', { ascending: false })

  if (error) throw toApiError(error.message)
  return (data ?? []).map((row: unknown) => toConnection(row as InstagramConnectionRow))
}

export async function createInstagramConnection(
  input: CreateInstagramConnectionInput,
): Promise<InstagramConnection> {
  return invokeConnectionFunction<InstagramConnection>('create-instagram-connection', input)
}

export async function updateInstagramConnection(
  id: string,
  input: UpdateInstagramConnectionInput,
): Promise<InstagramConnection> {
  return invokeConnectionFunction<InstagramConnection>('update-instagram-connection', { id, ...input })
}

export async function deleteInstagramConnection(id: string): Promise<void> {
  await invokeConnectionFunction<{ ok: boolean }>('delete-instagram-connection', { id })
}

export async function resolveInstagramConnection(id: string): Promise<InstagramConnection> {
  return invokeConnectionFunction<InstagramConnection>('resolve-instagram-connection', { id })
}

export async function refreshInstagramConnection(id: string): Promise<InstagramConnection> {
  return invokeConnectionFunction<InstagramConnection>('refresh-instagram-connection', { id })
}
