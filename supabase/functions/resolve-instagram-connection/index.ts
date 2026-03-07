import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { toSafeConnection, type SafeConnectionRow, safeConnectionSelect } from '../_shared/connections.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../_shared/crypto.ts'
import { GraphError, graphGetJson } from '../_shared/instagramGraph.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type ResolveConnectionBody = {
  id?: string
}

type GraphMeResponse = {
  id: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as ResolveConnectionBody | null
    const id = body?.id?.trim()

    if (!id) return errorResponse(400, 'id is required')

    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id, access_token_encrypted')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load connection before resolve', existingError)
      return errorResponse(500, 'Unable to resolve connection')
    }
    if (!existing || existing.owner_user_id !== user.id) return errorResponse(404, 'Connection not found')

    try {
      const accessToken = await decryptString(existing.access_token_encrypted)
      const me = await graphGetJson<GraphMeResponse>('me?fields=id', accessToken)
      if (!me?.id) throw new Error('Instagram response missing user id')

      const { data, error } = await admin
        .from('instagram_connections')
        .update({
          ig_user_id: me.id,
          page_id: null,
          connection_status: 'active',
        })
        .eq('id', id)
        .select(safeConnectionSelect)
        .single()

      if (error) {
        console.error('Failed to update connection after resolve', error)
        return errorResponse(500, 'Unable to resolve connection')
      }

      return jsonResponse(toSafeConnection(data as SafeConnectionRow))
    } catch (error) {
      if (error instanceof GraphError && [400, 401, 403].includes(error.status)) {
        return errorResponse(422, error.message)
      }

      console.error('Instagram resolve failed', error)
      return errorResponse(502, 'Instagram upstream error')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message)
  }
})
