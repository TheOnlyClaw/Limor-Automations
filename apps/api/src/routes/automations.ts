import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { sendError } from '../lib/reply.js'

function nowIso() {
  return new Date().toISOString()
}

function compileRegex(pattern: string, flags?: string | null) {
  const f = (flags ?? '').trim()
  // Only allow JS flags; Graph comment text matching happens in Node.
  if (f && !/^[dgimsuvy]+$/.test(f)) {
    throw new Error('Invalid regex flags')
  }
  // eslint-disable-next-line no-new
  return new RegExp(pattern, f)
}

const RuleInput = Type.Object({
  pattern: Type.String({ minLength: 1 }),
  flags: Type.Optional(Type.String({ maxLength: 16 })),
})

const ActionInput = Type.Object({
  type: Type.Union([Type.Literal('reply'), Type.Literal('dm')]),
  template: Type.String({ minLength: 1 }),
})

const AutomationSchema = Type.Object({
  id: Type.String(),
  tokenId: Type.String(),
  igPostId: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  enabled: Type.Boolean(),
  rules: Type.Array(
    Type.Object({
      id: Type.String(),
      pattern: Type.String(),
      flags: Type.Union([Type.String(), Type.Null()]),
      createdAt: Type.String(),
    })
  ),
  actions: Type.Array(
    Type.Object({
      id: Type.String(),
      type: Type.Union([Type.Literal('reply'), Type.Literal('dm')]),
      template: Type.String(),
      createdAt: Type.String(),
    })
  ),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

function rowToAutomation(app: any, row: any) {
  const rules = app.db
    .prepare('SELECT * FROM post_automation_rules WHERE automation_id = ? ORDER BY created_at ASC')
    .all(row.id)
    .map((r: any) => ({
      id: r.id,
      pattern: r.pattern,
      flags: r.flags ?? null,
      createdAt: r.created_at,
    }))

  const actions = app.db
    .prepare('SELECT * FROM post_automation_actions WHERE automation_id = ? ORDER BY created_at ASC')
    .all(row.id)
    .map((a: any) => ({
      id: a.id,
      type: a.type,
      template: a.template,
      createdAt: a.created_at,
    }))

  return {
    id: row.id,
    tokenId: row.token_id,
    igPostId: row.ig_post_id,
    name: row.name ?? null,
    enabled: !!row.enabled,
    rules,
    actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const automationsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/automations',
    {
      schema: {
        body: Type.Object({
          tokenId: Type.String({ minLength: 1 }),
          igPostId: Type.String({ minLength: 1 }),
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          enabled: Type.Optional(Type.Boolean()),
          rules: Type.Optional(Type.Array(RuleInput)),
          actions: Type.Optional(Type.Array(ActionInput)),
        }),
        response: {
          201: AutomationSchema,
        },
      },
    },
    async (req, reply) => {
      const body = req.body as any

      const token = app.db.prepare('SELECT id FROM instagram_tokens WHERE id = ?').get(body.tokenId)
      if (!token) return sendError(reply, 404, 'tokenId not found')

      const enabledBool = body.enabled === undefined ? true : Boolean(body.enabled)
      const rules = Array.isArray(body.rules) ? body.rules : []
      const actions = Array.isArray(body.actions) ? body.actions : []

      if (enabledBool && rules.length === 0) {
        return sendError(reply, 400, 'At least one rule is required when enabled')
      }

      // Validate regex patterns
      try {
        for (const r of rules) compileRegex(r.pattern, r.flags)
      } catch (e: any) {
        return sendError(reply, 400, `Invalid regex: ${e?.message ?? 'invalid'}`)
      }

      const id = randomUUID()
      const ts = nowIso()
      const enabled = enabledBool ? 1 : 0

      const tx = app.db.transaction(() => {
        app.db
          .prepare(
            `INSERT INTO post_automations (
              id, token_id, ig_post_id, name, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(id, body.tokenId, body.igPostId, body.name ?? null, enabled, ts, ts)

        const insRule = app.db.prepare(
          `INSERT INTO post_automation_rules (
            id, automation_id, pattern, flags, created_at
          ) VALUES (?, ?, ?, ?, ?)`
        )
        for (const r of rules) {
          insRule.run(randomUUID(), id, r.pattern, r.flags ?? null, ts)
        }

        const insAction = app.db.prepare(
          `INSERT INTO post_automation_actions (
            id, automation_id, type, template, created_at
          ) VALUES (?, ?, ?, ?, ?)`
        )
        for (const a of actions) {
          insAction.run(randomUUID(), id, a.type, a.template, ts)
        }
      })

      tx()

      const row = app.db.prepare('SELECT * FROM post_automations WHERE id = ?').get(id)
      return reply.code(201).send(rowToAutomation(app, row))
    }
  )

  app.get(
    '/api/v1/automations',
    {
      schema: {
        querystring: Type.Object({
          tokenId: Type.Optional(Type.String()),
          igPostId: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Array(AutomationSchema),
        },
      },
    },
    async (req) => {
      const q = req.query as any
      const where: string[] = []
      const args: any[] = []
      if (q.tokenId) {
        where.push('token_id = ?')
        args.push(q.tokenId)
      }
      if (q.igPostId) {
        where.push('ig_post_id = ?')
        args.push(q.igPostId)
      }
      const sql = `SELECT * FROM post_automations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`
      const rows = app.db.prepare(sql).all(...args)
      return rows.map((r: any) => rowToAutomation(app, r))
    }
  )

  app.get(
    '/api/v1/automations/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 200: AutomationSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params as any
      const row = app.db.prepare('SELECT * FROM post_automations WHERE id = ?').get(id)
      if (!row) return sendError(reply, 404, 'Not found')
      return rowToAutomation(app, row)
    }
  )

  app.patch(
    '/api/v1/automations/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          name: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()])),
          enabled: Type.Optional(Type.Boolean()),
          rules: Type.Optional(Type.Array(RuleInput)),
          actions: Type.Optional(Type.Array(ActionInput)),
        }),
        response: { 200: AutomationSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params as any
      const body = req.body as any

      const existing = app.db.prepare('SELECT * FROM post_automations WHERE id = ?').get(id) as any
      if (!existing) return sendError(reply, 404, 'Not found')

      const nextEnabledBool = body.enabled !== undefined ? Boolean(body.enabled) : Boolean(existing.enabled)
      const rules = body.rules !== undefined ? (Array.isArray(body.rules) ? body.rules : []) : undefined

      if (nextEnabledBool && rules !== undefined && rules.length === 0) {
        return sendError(reply, 400, 'At least one rule is required when enabled')
      }

      if (rules !== undefined) {
        try {
          for (const r of rules) compileRegex(r.pattern, r.flags)
        } catch (e: any) {
          return sendError(reply, 400, `Invalid regex: ${e?.message ?? 'invalid'}`)
        }
      }

      const ts = nowIso()

      const tx = app.db.transaction(() => {
        const nextName = body.name !== undefined ? body.name : existing.name
        const nextEnabled = nextEnabledBool ? 1 : 0

        app.db
          .prepare('UPDATE post_automations SET name = ?, enabled = ?, updated_at = ? WHERE id = ?')
          .run(nextName ?? null, nextEnabled, ts, id)

        if (rules !== undefined) {
          app.db.prepare('DELETE FROM post_automation_rules WHERE automation_id = ?').run(id)
          const insRule = app.db.prepare(
            `INSERT INTO post_automation_rules (id, automation_id, pattern, flags, created_at) VALUES (?, ?, ?, ?, ?)`
          )
          for (const r of rules) insRule.run(randomUUID(), id, r.pattern, r.flags ?? null, ts)
        }

        if (body.actions !== undefined) {
          const actions = Array.isArray(body.actions) ? body.actions : []
          app.db.prepare('DELETE FROM post_automation_actions WHERE automation_id = ?').run(id)
          const insAction = app.db.prepare(
            `INSERT INTO post_automation_actions (id, automation_id, type, template, created_at) VALUES (?, ?, ?, ?, ?)`
          )
          for (const a of actions) insAction.run(randomUUID(), id, a.type, a.template, ts)
        }
      })

      tx()

      const row = app.db.prepare('SELECT * FROM post_automations WHERE id = ?').get(id)
      return rowToAutomation(app, row)
    }
  )

  app.delete(
    '/api/v1/automations/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 204: Type.Null() },
      },
    },
    async (req, reply) => {
      const { id } = req.params as any
      const res = app.db.prepare('DELETE FROM post_automations WHERE id = ?').run(id)
      if (res.changes === 0) return sendError(reply, 404, 'Not found')
      return reply.code(204).send(null)
    }
  )
}
