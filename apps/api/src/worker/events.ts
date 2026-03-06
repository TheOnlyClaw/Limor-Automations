import { randomUUID } from 'node:crypto'
import { openDb } from '../db/index.js'

type WebhookEventRow = {
  id: string
  dedupe_key: string
  payload_json: string
  received_at: string
  status: 'pending' | 'processing' | 'processed' | 'failed'
  attempts: number
  last_error: string | null
  next_attempt_at: string | null
  locked_at: string | null
  locked_by: string | null
  processed_at: string | null
}

function isoNow() {
  return new Date().toISOString()
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseIntEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

function computeBackoffMs(attempts: number) {
  const minMs = parseIntEnv('WEBHOOK_BACKOFF_MIN_MS', 30_000)
  const maxMs = parseIntEnv('WEBHOOK_BACKOFF_MAX_MS', 6 * 60 * 60 * 1000)
  const exp = Math.min(20, Math.max(0, attempts))
  return Math.min(maxMs, minMs * Math.pow(2, exp))
}

export async function runWebhookWorker() {
  const rawPath = process.env.DB_PATH
    ? new URL(process.env.DB_PATH, `file://${process.cwd()}/`).pathname
    : undefined
  const db = openDb(rawPath)

  const workerId = process.env.WEBHOOK_WORKER_ID ?? randomUUID()
  const pollMs = parseIntEnv('WEBHOOK_POLL_MS', 1000)
  const batchSize = parseIntEnv('WEBHOOK_BATCH_SIZE', 20)
  const lockTtlMs = parseIntEnv('WEBHOOK_LOCK_TTL_MS', 5 * 60 * 1000)

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ msg: 'webhook-worker-start', workerId, pollMs, batchSize, lockTtlMs }))

  // Continuous loop by default; allow one-shot for CI/debug
  const oneShot = process.env.WEBHOOK_ONE_SHOT === '1'

  while (true) {
    const now = Date.now()
    const lockExpiredBefore = new Date(now - lockTtlMs).toISOString()
    const nowIso = new Date(now).toISOString()

    // Claim a batch. We do it in a transaction to reduce race windows.
    const claimed = db.transaction(() => {
      const candidates = db
        .prepare(
          `SELECT *
           FROM instagram_webhook_events
           WHERE
             (status = 'pending' OR status = 'failed')
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
             AND (locked_at IS NULL OR locked_at < ?)
           ORDER BY received_at ASC
           LIMIT ?`,
        )
        .all(nowIso, lockExpiredBefore, batchSize) as WebhookEventRow[]

      if (candidates.length === 0) return [] as WebhookEventRow[]

      const update = db.prepare(
        `UPDATE instagram_webhook_events
         SET status='processing', locked_at=?, locked_by=?
         WHERE id=?`,
      )

      for (const row of candidates) update.run(nowIso, workerId, row.id)

      // Re-select to return locked rows (authoritative)
      const ids = candidates.map((r) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      return db
        .prepare(`SELECT * FROM instagram_webhook_events WHERE id IN (${placeholders})`)
        .all(...ids) as WebhookEventRow[]
    })()

    for (const ev of claimed) {
      try {
        // 0008 will actually parse & execute. For 0007 we just validate JSON is parseable.
        JSON.parse(ev.payload_json)

        db.prepare(
          `UPDATE instagram_webhook_events
           SET status='processed', processed_at=?, locked_at=NULL, locked_by=NULL, last_error=NULL
           WHERE id=? AND locked_by=?`,
        ).run(isoNow(), ev.id, workerId)

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ msg: 'webhook-event-processed', id: ev.id, dedupe_key: ev.dedupe_key }))
      } catch (err) {
        const attempts = (ev.attempts ?? 0) + 1
        const backoffMs = computeBackoffMs(attempts)
        const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString()
        const msg = err instanceof Error ? err.message : String(err)

        db.prepare(
          `UPDATE instagram_webhook_events
           SET status='failed', attempts=?, last_error=?, next_attempt_at=?, locked_at=NULL, locked_by=NULL
           WHERE id=? AND locked_by=?`,
        ).run(attempts, msg, nextAttemptAt, ev.id, workerId)

        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ msg: 'webhook-event-failed', id: ev.id, attempts, nextAttemptAt, error: msg }))
      }
    }

    if (oneShot) break

    if (claimed.length === 0) await sleep(pollMs)
  }
}
