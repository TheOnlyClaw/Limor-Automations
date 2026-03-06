import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'

export async function automationExecutionsRoutes(app: FastifyInstance) {
  app.get(
    '/automations/:id/executions',
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }),
      },
    },
    async (req) => {
      const { id } = req.params as any
      const rows = app.db
        .prepare(
          `SELECT *
           FROM automation_executions
           WHERE automation_id = ?
           ORDER BY created_at DESC
           LIMIT 200`,
        )
        .all(id)

      return { items: rows }
    },
  )
}
