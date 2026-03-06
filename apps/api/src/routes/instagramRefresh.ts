import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'
import { httpGetJson } from '../lib/http.js'

// Graph long-lived token extension
// https://developers.facebook.com/docs/facebook-login/access-tokens/refreshing

type ExtendTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

function nowIso() {
  return new Date().toISOString()
}

function plusSecondsIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

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
      const token = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(id) as any
      if (!token) return sendError(reply, 404, 'Not found')

      const appId = process.env.FB_APP_ID
      const appSecret = process.env.FB_APP_SECRET
      if (!appId || !appSecret) {
        return sendError(reply, 500, 'Missing FB_APP_ID/FB_APP_SECRET')
      }

      const version = process.env.FB_GRAPH_VERSION ?? 'v21.0'
      const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
      url.searchParams.set('grant_type', 'fb_exchange_token')
      url.searchParams.set('client_id', appId)
      url.searchParams.set('client_secret', appSecret)
      url.searchParams.set('fb_exchange_token', token.access_token)

      try {
        app.db.prepare('UPDATE instagram_tokens SET refresh_status = ?, refresh_error = ?, updated_at = ? WHERE id = ?').run(
          'refreshing',
          null,
          nowIso(),
          id
        )

        const data = await httpGetJson<ExtendTokenResponse>(url.toString())
        const expiresAt = typeof data.expires_in === 'number' ? plusSecondsIso(data.expires_in) : null

        app.db
          .prepare(
            `UPDATE instagram_tokens SET
              access_token = ?,
              expires_at = ?,
              last_refreshed_at = ?,
              refresh_status = ?,
              refresh_error = ?,
              updated_at = ?
            WHERE id = ?`
          )
          .run(
            data.access_token,
            expiresAt,
            nowIso(),
            'ok',
            null,
            nowIso(),
            id
          )

        return { ok: true, id, expiresAt }
      } catch (e: any) {
        req.log.error({ err: e, data: e?.data }, 'token refresh failed')
        app.db
          .prepare('UPDATE instagram_tokens SET refresh_status = ?, refresh_error = ?, updated_at = ? WHERE id = ?')
          .run('error', String(e?.message ?? 'error'), nowIso(), id)
        return sendError(reply, 502, 'Facebook upstream error')
      }
    }
  )
}
