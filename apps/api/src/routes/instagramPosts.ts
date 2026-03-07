import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'
import { httpGetJson } from '../lib/http.js'

type PostsResponse = {
  items: Array<{
    id: string
    caption: string | null
    mediaType: string
    mediaUrl: string | null
    permalink: string | null
    timestamp: string | null
    thumbnailUrl: string | null
  }>
}

type CacheEntry = {
  expiresAtMs: number
  value: PostsResponse
}

const postsCache = new Map<string, CacheEntry>()
const postsInFlight = new Map<string, Promise<PostsResponse>>()

function parseTtlMs(): number {
  const raw = process.env.IG_POSTS_CACHE_TTL_MS
  if (!raw) return 5 * 60 * 1000
  const n = Number(raw)
  if (!Number.isFinite(n)) return 5 * 60 * 1000
  return Math.max(0, Math.floor(n))
}

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

      const ttlMs = parseTtlMs()
      const cacheKey = `${tokenId}:${limit}`

      if (ttlMs > 0) {
        const now = Date.now()
        const cached = postsCache.get(cacheKey)
        if (cached && cached.expiresAtMs > now) {
          reply.header('x-cache', 'hit')
          return cached.value
        }

        const pending = postsInFlight.get(cacheKey)
        if (pending) {
          reply.header('x-cache', 'shared')
          return pending
        }
      }

      const path = token.ig_user_id ? `${token.ig_user_id}/media` : 'me/media'
      const fields = [
        'id',
        'caption',
        'media_type',
        'media_url',
        'permalink',
        'timestamp',
        'thumbnail_url',
      ].join(',')

      const url = new URL(`https://graph.instagram.com/${path}`)
      url.searchParams.set('fields', fields)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('access_token', token.access_token)

      async function fetchPosts(): Promise<PostsResponse> {
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
      }

      try {
        if (ttlMs <= 0) {
          reply.header('x-cache', 'bypass')
          return await fetchPosts()
        }

        const p = fetchPosts()
          .then((value) => {
            postsCache.set(cacheKey, { expiresAtMs: Date.now() + ttlMs, value })
            return value
          })
          .finally(() => {
            postsInFlight.delete(cacheKey)
          })

        postsInFlight.set(cacheKey, p)
        reply.header('x-cache', 'miss')
        return await p
      } catch (e: any) {
        req.log.error({ err: e, data: e?.data }, 'instagram posts retrieval failed')
        return sendError(reply, 502, 'Instagram upstream error')
      }
    }
  )
}
