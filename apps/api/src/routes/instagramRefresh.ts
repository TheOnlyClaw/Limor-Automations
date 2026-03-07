import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'
import { refreshInstagramToken } from '../lib/instagramTokenRefresh.js'

export const instagramRefreshRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/instagram-tokens/:id/refresh',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Type.Object({
            ok: Type.Boolean(),
            id: Type.String(),
            expiresAt: Type.Union([Type.String(), Type.Null()]),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      try {
        const exists = app.db.prepare('SELECT 1 as one FROM instagram_tokens WHERE id = ?').get(id) as
          | { one: number }
          | undefined
        if (!exists) return sendError(reply, 404, 'Not found')

        const res = await refreshInstagramToken(app.db, { id, logger: req.log })
        if (!res.ok) return sendError(reply, 409, 'Refresh already in progress')
        return { ok: true, id, expiresAt: res.expiresAt }
      } catch (e: unknown) {
        req.log.error({ err: e }, 'token refresh failed')
        return sendError(reply, 502, 'Instagram upstream error')
      }
    }
  )
}
