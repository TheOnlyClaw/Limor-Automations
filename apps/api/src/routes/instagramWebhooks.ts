import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as any).sort())
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function computeDedupeKey(payload: any): string {
  try {
    const object = payload?.object ?? 'unknown'
    const entry = Array.isArray(payload?.entry) ? payload.entry : []

    // Try to build a deterministic key from entry+changes.
    // Facebook webhook shape: { object, entry: [{ id, time, changes: [{ field, value: {...}}]}] }
    const parts: string[] = [String(object)]

    for (const e of entry) {
      parts.push(String(e?.id ?? ''))
      const changes = Array.isArray(e?.changes) ? e.changes : []
      for (const c of changes) {
        parts.push(String(c?.field ?? ''))
        // best-effort: comment id is often in value.id
        const val = c?.value
        if (val && typeof val === 'object') {
          if ('id' in val) parts.push(String((val as any).id))
          if ('comment_id' in val) parts.push(String((val as any).comment_id))
          if ('media_id' in val) parts.push(String((val as any).media_id))
        }
      }
    }

    const compact = parts.filter(Boolean).join('|')
    if (compact.length > 0 && compact !== 'unknown') return sha256Hex(compact)
  } catch {
    // ignore
  }

  // Fallback to hash of stable-ish JSON.
  return sha256Hex(stableStringify(payload))
}

export const instagramWebhooksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/webhooks/instagram', async (req, reply) => {
    const mode = (req.query as any)['hub.mode']
    const token = (req.query as any)['hub.verify_token']
    const challenge = (req.query as any)['hub.challenge']

    const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN
    if (!expected) {
      req.log.error('IG_WEBHOOK_VERIFY_TOKEN is not set')
      return reply.code(500).send({ error: 'Server not configured' })
    }

    if (mode === 'subscribe' && token === expected) {
      reply.header('content-type', 'text/plain')
      return reply.code(200).send(String(challenge ?? ''))
    }

    return reply.code(403).send({ error: 'Forbidden' })
  })

  app.post('/api/v1/webhooks/instagram', async (req, reply) => {
    const payload = req.body
    const now = new Date().toISOString()

    // Facebook sometimes sends an empty body; store it anyway for debugging.
    const payloadJson = JSON.stringify(payload ?? null)
    const dedupeKey = computeDedupeKey(payload)
    const id = crypto.randomUUID()

    try {
      app.db
        .prepare(
          `INSERT INTO instagram_webhook_events (id, dedupe_key, received_at, payload_json, status, attempts)
           VALUES (@id, @dedupe_key, @received_at, @payload_json, 'pending', 0)`
        )
        .run({
          id,
          dedupe_key: dedupeKey,
          received_at: now,
          payload_json: payloadJson,
        })
    } catch (err: any) {
      // Ignore duplicates (retries)
      if (String(err?.message ?? '').includes('UNIQUE') || String(err?.code ?? '') === 'SQLITE_CONSTRAINT_UNIQUE') {
        req.log.info({ dedupeKey }, 'duplicate webhook delivery ignored')
      } else {
        req.log.error({ err }, 'failed to persist webhook event')
        // Still return 200 to avoid webhook hammering; we can inspect logs.
      }
    }

    return reply.code(200).send({ ok: true })
  })
}
