import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { toSafeConnection, type SafeConnectionRow, safeConnectionSelect } from '../_shared/connections.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString, encryptString } from '../_shared/crypto.ts'
import { GraphError, graphGetJson } from '../_shared/instagramGraph.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type RefreshConnectionBody = {
  id?: string
}

type RefreshResponse = {
  access_token: string
  expires_in?: number
}

function plusSecondsIso(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(Date.now() + seconds * 1000).toISOString()
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as RefreshConnectionBody | null
    const id = body?.id?.trim()

    if (!id) return errorResponse(400, 'id is required', req)

    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id, access_token_encrypted')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load connection before refresh', existingError)
      return errorResponse(500, 'Unable to refresh connection', req)
    }
    if (!existing || existing.owner_user_id !== user.id) return errorResponse(404, 'Connection not found', req)

    try {
      const accessToken = await decryptString(existing.access_token_encrypted)
      const refreshed = await graphGetJson<RefreshResponse>(
        'refresh_access_token?grant_type=ig_refresh_token',
        accessToken,
      )
      if (!refreshed.access_token) throw new Error('Instagram refresh response missing access_token')

      const expiresAt = plusSecondsIso(refreshed.expires_in)
      const encryptedToken = await encryptString(refreshed.access_token)

      const { data, error } = await admin
        .from('instagram_connections')
        .update({
          access_token_encrypted: encryptedToken,
          token_expires_at: expiresAt,
          last_refreshed_at: new Date().toISOString(),
          refresh_status: 'ok',
          refresh_error: null,
          connection_status: 'active',
        })
        .eq('id', id)
        .select(safeConnectionSelect)
        .single()

      if (error) {
        console.error('Failed to update connection after refresh', error)
        return errorResponse(500, 'Unable to refresh connection', req)
      }

      return jsonResponse(toSafeConnection(data as SafeConnectionRow), 200, req)
    } catch (error) {
      const refreshError =
        error instanceof GraphError
          ? 'Instagram refresh failed. Check token permissions or reconnect the account.'
          : 'Refresh failed. Try again later.'

      await admin
        .from('instagram_connections')
        .update({
          refresh_status: 'error',
          refresh_error: refreshError,
        })
        .eq('id', id)

      if (error instanceof GraphError && [400, 401, 403].includes(error.status)) {
        return errorResponse(422, error.message, req)
      }

      console.error('Instagram refresh failed', error)
      return errorResponse(502, 'Instagram upstream error', req)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message, req)
  }
})
