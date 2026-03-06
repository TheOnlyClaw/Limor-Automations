import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'
import { httpGetJson } from '../lib/http.js'

const PostSchema = Type.Object({
  id: Type.String(),
  caption: Type.Union([Type.String(), Type.Null()]),
  mediaType: Type.String(),
  mediaUrl: Type.Union([Type.String(), Type.Null()]),
  permalink: Type.Union([Type.String(), Type.Null()]),
  timestamp: Type.Union([Type.String(), Type.Null()]),
  thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
})

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
  data: GraphMediaItem[]
}

export const instagramPostsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/instagram/posts',
    {
      schema: {
        querystring: Type.Object({
          tokenId: Type.String({ minLength: 1 }),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(PostSchema),
          }),
        },
      },
    },
    async (req, reply) => {
      const { tokenId, limit = 30 } = req.query as { tokenId: string; limit?: number }

      const token = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(tokenId) as any
      if (!token) return sendError(reply, 404, 'Token not found')
      if (!token.ig_user_id) return sendError(reply, 400, 'Token missing igUserId')

      const version = process.env.FB_GRAPH_VERSION ?? 'v21.0'
      const fields = [
        'id',
        'caption',
        'media_type',
        'media_url',
        'permalink',
        'timestamp',
        'thumbnail_url',
      ].join(',')

      const url = new URL(`https://graph.facebook.com/${version}/${token.ig_user_id}/media`)
      url.searchParams.set('fields', fields)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('access_token', token.access_token)

      try {
        const data = await httpGetJson<GraphMediaResponse>(url.toString())

        return {
          items: (data.data ?? []).map((m) => ({
            id: m.id,
            caption: m.caption ?? null,
            mediaType: m.media_type ?? 'UNKNOWN',
            mediaUrl: m.media_url ?? null,
            permalink: m.permalink ?? null,
            timestamp: m.timestamp ?? null,
            thumbnailUrl: m.thumbnail_url ?? null,
          })),
        }
      } catch (e: any) {
        req.log.error({ err: e, data: e?.data }, 'instagram posts retrieval failed')
        return sendError(reply, 502, 'Instagram upstream error')
      }
    }
  )
}
