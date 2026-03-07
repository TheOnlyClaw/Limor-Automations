import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type DeleteConnectionBody = {
  id?: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed', req)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as DeleteConnectionBody | null
    const id = body?.id?.trim()

    if (!id) return errorResponse(400, 'id is required', req)

    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load connection before delete', existingError)
      return errorResponse(500, 'Unable to delete connection', req)
    }
    if (!existing || existing.owner_user_id !== user.id) return errorResponse(404, 'Connection not found', req)

    const { error } = await admin.from('instagram_connections').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete connection', error)
      return errorResponse(500, 'Unable to delete connection', req)
    }

    return jsonResponse({ ok: true }, 200, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message, req)
  }
})
