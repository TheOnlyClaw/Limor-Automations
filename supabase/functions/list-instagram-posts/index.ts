import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { requireUser } from '../_shared/auth.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../_shared/crypto.ts'
import { GraphError, graphGetJson } from '../_shared/instagramGraph.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type ListPostsBody = {
  connectionId?: string
  limit?: number
}

type GraphMediaItem = {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  permalink?: string
  timestamp?: string
  thumbnail_url?: string
}

type GraphMediaResponse = {
  data?: GraphMediaItem[]
}

function clampLimit(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 30
  return Math.max(1, Math.min(30, Math.floor(value)))
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => null)) as ListPostsBody | null
    const connectionId = body?.connectionId?.trim()

    if (!connectionId) return errorResponse(400, 'connectionId is required')
    if (!isUuid(connectionId)) return errorResponse(400, 'connectionId must be a UUID')

    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('instagram_connections')
      .select('id, owner_user_id, ig_user_id, access_token_encrypted')
      .eq('id', connectionId)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load connection before listing posts', existingError)
      return errorResponse(500, 'Unable to list posts')
    }

    if (!existing || existing.owner_user_id !== user.id) {
      return errorResponse(404, 'Connection not found')
    }

    const accessToken = await decryptString(existing.access_token_encrypted)
    const limit = clampLimit(body?.limit)
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'permalink',
      'timestamp',
      'thumbnail_url',
    ].join(',')
    const pathPrefix = existing.ig_user_id ? `${existing.ig_user_id}/media` : 'me/media'
    const path = `${pathPrefix}?fields=${encodeURIComponent(fields)}&limit=${limit}`

    try {
      const media = await graphGetJson<GraphMediaResponse>(path, accessToken)
      const syncedAt = new Date().toISOString()
      const items = (media.data ?? []).map((item) => ({
        id: item.id,
        caption: item.caption ?? null,
        mediaType: item.media_type ?? 'UNKNOWN',
        mediaUrl: item.media_url ?? null,
        permalink: item.permalink ?? null,
        timestamp: item.timestamp ?? null,
        thumbnailUrl: item.thumbnail_url ?? null,
        rawJson: item,
      }))

      const rows = items.map((item) => ({
        connection_id: connectionId,
        id: item.id,
        caption: item.caption,
        media_type: item.mediaType,
        media_url: item.mediaUrl,
        permalink: item.permalink,
        posted_at: item.timestamp,
        raw_json: item.rawJson,
        synced_at: syncedAt,
        thumbnail_url: item.thumbnailUrl,
      }))

      if (rows.length > 0) {
        const { error: upsertError } = await admin.from('instagram_posts').upsert(rows, {
          onConflict: 'connection_id,id',
        })

        if (upsertError) {
          console.error('Failed to cache instagram posts', upsertError)
          return errorResponse(500, 'Unable to store posts')
        }
      }

      const { error: updateError } = await admin
        .from('instagram_connections')
        .update({ last_posts_sync_at: syncedAt })
        .eq('id', connectionId)

      if (updateError) {
        console.error('Failed to update last_posts_sync_at', updateError)
        return errorResponse(500, 'Unable to store posts')
      }

      return jsonResponse({
        items: items.map(({ rawJson, ...item }) => item),
      })
    } catch (error) {
      if (error instanceof GraphError && [400, 401, 403].includes(error.status)) {
        return errorResponse(422, error.message)
      }

      console.error('Instagram posts fetch failed', error)
      return errorResponse(502, 'Instagram upstream error')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return errorResponse(status, message)
  }
})
