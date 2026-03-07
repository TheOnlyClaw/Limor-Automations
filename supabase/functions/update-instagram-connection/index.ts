import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { toSafeConnection, type SafeConnectionRow, safeConnectionSelect } from '../_shared/connections.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { encryptString } from '../_shared/crypto.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type UpdateConnectionBody = {
  id?: string
  label?: string | null
  igUserId?: string | null
  accessToken?: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as UpdateConnectionBody | null
    const id = body?.id?.trim()

    if (!id) return errorResponse(400, 'id is required', req)

    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load connection before update', existingError)
      return errorResponse(500, 'Unable to update connection', req)
    }
    if (!existing || existing.owner_user_id !== user.id) return errorResponse(404, 'Connection not found', req)

    const patch: Record<string, string | null> = {}

    if (body?.label !== undefined) patch.label = body.label?.trim() || null
    if (body?.igUserId !== undefined) patch.ig_user_id = body.igUserId?.trim() || null
    if (body?.accessToken !== undefined) {
      const nextToken = body.accessToken.trim()
      if (!nextToken) return errorResponse(400, 'accessToken cannot be empty', req)
      patch.access_token_encrypted = await encryptString(nextToken)
    }

    if (Object.keys(patch).length === 0) {
      const { data, error } = await admin.from('instagram_connections').select(safeConnectionSelect).eq('id', id).single()
      if (error) {
        console.error('Failed to load connection during no-op update', error)
        return errorResponse(500, 'Unable to update connection', req)
      }
      return jsonResponse(toSafeConnection(data as SafeConnectionRow), 200, req)
    }

    const { data, error } = await admin
      .from('instagram_connections')
      .update(patch)
      .eq('id', id)
      .select(safeConnectionSelect)
      .single()

    if (error) {
      console.error('Failed to update connection', error)
      return errorResponse(500, 'Unable to update connection', req)
    }
    return jsonResponse(toSafeConnection(data as SafeConnectionRow), 200, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message, req)
  }
})
