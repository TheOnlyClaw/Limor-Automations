import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'

type GraphMeResponse = {
  id: string
}

type GraphErrorPayload = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

class GraphError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data: unknown) {
    super(message)
    this.name = 'GraphError'
    this.status = status
    this.data = data
  }
}

function nowIso() {
  return new Date().toISOString()
}

function safeGraphErrorMessage(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const d = data as GraphErrorPayload
  if (typeof d.error?.message === 'string' && d.error.message.length) return d.error.message
  return null
}

async function graphGet<T>({
  path,
  accessToken,
}: {
  path: string
  accessToken: string
}): Promise<T> {
  const url = new URL(`https://graph.instagram.com/${path}`)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  })


  const text = await res.text()
  const data = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  })()

  if (!res.ok) {
    const msg = safeGraphErrorMessage(data) ?? `Graph GET failed (${res.status})`
    throw new GraphError(res.status, msg, data)
  }

  return data as T
}

export const instagramBootstrapRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/instagram-tokens/:id/resolve-ids',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Type.Object({
            id: Type.String(),
            page_id: Type.Union([Type.String(), Type.Null()]),
            ig_user_id: Type.String(),
          }),
          404: Type.Object({ message: Type.String() }),
          422: Type.Object({ message: Type.String() }),
          502: Type.Object({ message: Type.String() }),
        },
      },
    },
    async (req, reply) => {
      const id = (req.params as any).id as string

      const tokenRow = app.db
        .prepare('SELECT id, access_token FROM instagram_tokens WHERE id = ?')
        .get(id) as { id: string; access_token: string } | undefined

      if (!tokenRow) return sendError(reply, 404, 'Not found')

      try {
        // Instagram User access tokens can resolve their IG user id via /me.
        const me = await graphGet<GraphMeResponse>({
          path: 'me?fields=id',
          accessToken: tokenRow.access_token,
        })

        const pageId = null
        const igUserId = me.id

        app.db
          .prepare(
            `UPDATE instagram_tokens
             SET page_id = ?, ig_user_id = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(pageId, igUserId, nowIso(), id)

        return reply.code(200).send({
          id,
          page_id: pageId,
          ig_user_id: igUserId,
        })
      } catch (e: unknown) {
        const status = e instanceof GraphError ? e.status : undefined
        req.log.error({ err: e, status }, 'resolve-ids failed')

        if (e instanceof GraphError && (e.status === 400 || e.status === 401 || e.status === 403)) {
          return sendError(reply, 422, e.message)
        }

        return sendError(reply, 502, 'Instagram upstream error')
      }
    }
  )
}
