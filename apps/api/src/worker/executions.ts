import type Database from 'better-sqlite3'
import { httpPostFormJson, httpPostJson } from '../lib/http.js'
import { extractCommentEvent } from './executeEvent.js'

type QueuedExecutionRow = {
  id: string
  action_type: 'reply' | 'dm'
  attempts: number
  payload_json: string
  access_token: string
  ig_user_id: string | null
  template: string | null
}

function isoNow() {
  return new Date().toISOString()
}

function graphVersion() {
  return process.env.FB_GRAPH_VERSION ?? 'v19.0'
}

async function sendCommentReply(args: { accessToken: string; commentId: string; message: string }) {
  const url = `https://graph.instagram.com/${graphVersion()}/${args.commentId}/replies`
  return httpPostFormJson<any>(url, {
    message: args.message,
    access_token: args.accessToken,
  })
}

async function sendDm(args: { accessToken: string; senderIgUserId: string; commentId: string; message: string }) {
  console.log({args});
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  return httpPostJson<any>(url.toString(), {
    recipient: { "comment_id": args.commentId },
    message: { text: args.message },
  })
}

export async function processQueuedExecutionsForEvent(
  db: Database.Database,
  args: { eventId: string },
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const rows = db
    .prepare(
      `SELECT
        e.id,
        e.action_type,
        e.attempts,
        ev.payload_json,
        t.access_token,
        t.ig_user_id,
        (
          SELECT template
          FROM post_automation_actions
          WHERE automation_id = e.automation_id AND type = e.action_type
          ORDER BY created_at ASC
          LIMIT 1
        ) AS template
      FROM automation_executions e
      JOIN instagram_webhook_events ev ON ev.id = e.event_id
      JOIN post_automations pa ON pa.id = e.automation_id
      JOIN instagram_tokens t ON t.id = pa.token_id
      WHERE e.event_id = ? AND e.status = 'queued'
      ORDER BY e.created_at ASC`,
    )
    .all(args.eventId) as QueuedExecutionRow[]

  let attempted = 0
  let succeeded = 0
  let failed = 0

  for (const row of rows) {
    attempted += 1
    const parsed = extractCommentEvent(row.payload_json)
    const template = (row.template ?? '').trim()

    if (!parsed) {
      db.prepare(
        `UPDATE automation_executions
         SET status='failed', attempts=attempts+1, last_error=?, updated_at=?
         WHERE id=?`,
      ).run('Unsupported webhook payload for execution', isoNow(), row.id)
      failed += 1
      continue
    }

    if (!template) {
      db.prepare(
        `UPDATE automation_executions
         SET status='failed', attempts=attempts+1, last_error=?, updated_at=?
         WHERE id=?`,
      ).run('Action template missing', isoNow(), row.id)
      failed += 1
      continue
    }

    try {
      if (row.action_type === 'reply') {
        await sendCommentReply({
          accessToken: row.access_token,
          commentId: parsed.commentId,
          message: template,
        })
      } else {
        if (!parsed.commentId) throw new Error('Missing self_ig_scoped_id for DM recipient')
        if (!row.ig_user_id) throw new Error('Missing sender ig_user_id on token (run resolve-ids)')
        console.log({parsed});
        await sendDm({
          accessToken: row.access_token,
          senderIgUserId: row.ig_user_id,
          commentId: parsed.commentId,
          message: template,
        })
      }

      db.prepare(
        `UPDATE automation_executions
         SET status='succeeded', attempts=attempts+1, last_error=NULL, updated_at=?
         WHERE id=?`,
      ).run(isoNow(), row.id)
      succeeded += 1
    } catch (e: any) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e)
      db.prepare(
        `UPDATE automation_executions
         SET status='failed', attempts=attempts+1, last_error=?, updated_at=?
         WHERE id=?`,
      ).run(msg, isoNow(), row.id)
      failed += 1
      continue
    }
  }

  return { attempted, succeeded, failed }
}
