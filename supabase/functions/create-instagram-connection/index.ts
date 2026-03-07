import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { toSafeConnection, type SafeConnectionRow, safeConnectionSelect } from '../_shared/connections.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { encryptString } from '../_shared/crypto.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type CreateConnectionBody = {
  label?: string
  accessToken?: string
  igUserId?: string | null
  metaAppId?: string | null
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as CreateConnectionBody | null
    const accessToken = body?.accessToken?.trim()

    if (!accessToken) return errorResponse(400, 'accessToken is required')

    const label = body?.label?.trim() || null
    const igUserId = body?.igUserId?.trim() || null
    const metaAppId = body?.metaAppId?.trim() || null
    const encryptedToken = await encryptString(accessToken)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('instagram_connections')
      .insert({
        owner_user_id: user.id,
        label,
        ig_user_id: igUserId,
        meta_app_id: metaAppId,
        access_token_encrypted: encryptedToken,
      })
      .select(safeConnectionSelect)
      .single()

    if (error) {
      console.error('Failed to create connection', error)
      return errorResponse(500, 'Unable to create connection')
    }
    return jsonResponse(toSafeConnection(data as SafeConnectionRow), 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message)
  }
})
