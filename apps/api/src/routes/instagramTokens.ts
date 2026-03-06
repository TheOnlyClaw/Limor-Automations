import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../lib/reply.js'
import { randomUUID } from 'node:crypto'

const TokenSchema = Type.Object({
  id: Type.String(),
  label: Type.Union([Type.String(), Type.Null()]),
  accessToken: Type.String(),
  igUserId: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  lastRefreshedAt: Type.Union([Type.String(), Type.Null()]),
  refreshStatus: Type.Union([Type.String(), Type.Null()]),
  refreshError: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

function nowIso() {
  return new Date().toISOString()
}

function rowToToken(row: any) {
  return {
    id: row.id,
    label: row.label ?? null,
    accessToken: row.access_token,
    igUserId: row.ig_user_id ?? null,
    expiresAt: row.expires_at ?? null,
    lastRefreshedAt: row.last_refreshed_at ?? null,
    refreshStatus: row.refresh_status ?? null,
    refreshError: row.refresh_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const instagramTokensRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/instagram-tokens',
    {
      schema: {
        body: Type.Object({
          label: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          accessToken: Type.String({ minLength: 1 }),
          igUserId: Type.Optional(Type.String({ minLength: 1 })),
        }),
        response: {
          201: TokenSchema,
        },
      },
    },
    async (req, reply) => {
      const id = randomUUID()
      const ts = nowIso()
      const body = req.body as { label?: string; accessToken: string; igUserId?: string }

      app.db
        .prepare(
          `INSERT INTO instagram_tokens (
            id, label, access_token, ig_user_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, body.label ?? null, body.accessToken, body.igUserId ?? null, ts, ts)

      const row = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(id)
      return reply.code(201).send(rowToToken(row))
    }
  )

  app.get(
    '/api/v1/instagram-tokens',
    {
      schema: {
        response: {
          200: Type.Array(TokenSchema),
        },
      },
    },
    async () => {
      const rows = app.db.prepare('SELECT * FROM instagram_tokens ORDER BY created_at DESC').all()
      return rows.map(rowToToken)
    }
  )

  app.get(
    '/api/v1/instagram-tokens/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: {
          200: TokenSchema,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const row = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(id)
      if (!row) return sendError(reply, 404, 'Not found')
      return rowToToken(row)
    }
  )

  app.patch(
    '/api/v1/instagram-tokens/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          label: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()])),
          accessToken: Type.Optional(Type.String({ minLength: 1 })),
          igUserId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
          expiresAt: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
          lastRefreshedAt: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
          refreshStatus: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
          refreshError: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
        }),
        response: {
          200: TokenSchema,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = req.body as any

      const existing = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(id) as any
      if (!existing) return sendError(reply, 404, 'Not found')

      const ts = nowIso()
      const next = {
        label: body.label !== undefined ? body.label : existing.label,
        access_token: body.accessToken !== undefined ? body.accessToken : existing.access_token,
        ig_user_id: body.igUserId !== undefined ? body.igUserId : existing.ig_user_id,
        expires_at: body.expiresAt !== undefined ? body.expiresAt : existing.expires_at,
        last_refreshed_at: body.lastRefreshedAt !== undefined ? body.lastRefreshedAt : existing.last_refreshed_at,
        refresh_status: body.refreshStatus !== undefined ? body.refreshStatus : existing.refresh_status,
        refresh_error: body.refreshError !== undefined ? body.refreshError : existing.refresh_error,
      }

      app.db
        .prepare(
          `UPDATE instagram_tokens SET
            label = ?,
            access_token = ?,
            ig_user_id = ?,
            expires_at = ?,
            last_refreshed_at = ?,
            refresh_status = ?,
            refresh_error = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          next.label ?? null,
          next.access_token,
          next.ig_user_id ?? null,
          next.expires_at ?? null,
          next.last_refreshed_at ?? null,
          next.refresh_status ?? null,
          next.refresh_error ?? null,
          ts,
          id
        )

      const row = app.db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(id)
      return rowToToken(row)
    }
  )

  app.delete(
    '/api/v1/instagram-tokens/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: {
          204: Type.Null(),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const res = app.db.prepare('DELETE FROM instagram_tokens WHERE id = ?').run(id)
      if (res.changes === 0) return sendError(reply, 404, 'Not found')
      return reply.code(204).send(null)
    }
  )
}
