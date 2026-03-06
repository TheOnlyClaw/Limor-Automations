import type Database from 'better-sqlite3'

type AutomationRow = {
  id: string
  token_id: string
  ig_post_id: string
  name: string
  enabled: 0 | 1
  created_at: string
  updated_at: string
}

type RuleRow = {
  id: string
  automation_id: string
  pattern: string
  flags: string | null
}

type ActionRow = {
  id: string
  automation_id: string
  type: 'reply' | 'dm'
  template: string
}

type ParsedCommentEvent = {
  igPostId: string
  commentText: string
}

// Best-effort extractor for Graph webhook shapes.
export function extractCommentEvent(payloadJson: string): ParsedCommentEvent | null {
  const payload = JSON.parse(payloadJson) as any

  // Typical structure: { object, entry:[{ changes:[{ field, value:{ media_id, text, ... }}]}] }
  const entry = payload?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value

  const igPostId = value?.media_id ?? value?.media?.id
  const commentText = value?.text ?? value?.message

  if (typeof igPostId !== 'string' || typeof commentText !== 'string') return null
  if (!igPostId.trim()) return null

  return { igPostId, commentText }
}

function loadAutomationsForPost(db: Database.Database, igPostId: string): AutomationRow[] {
  return db
    .prepare(
      `SELECT *
       FROM post_automations
       WHERE ig_post_id = ? AND enabled = 1
       ORDER BY created_at ASC`,
    )
    .all(igPostId) as AutomationRow[]
}

function loadRules(db: Database.Database, automationId: string): RuleRow[] {
  return db
    .prepare(
      `SELECT *
       FROM post_automation_rules
       WHERE automation_id = ?
       ORDER BY created_at ASC`,
    )
    .all(automationId) as RuleRow[]
}

function loadActions(db: Database.Database, automationId: string): ActionRow[] {
  return db
    .prepare(
      `SELECT *
       FROM post_automation_actions
       WHERE automation_id = ?
       ORDER BY created_at ASC`,
    )
    .all(automationId) as ActionRow[]
}

function rulesMatch(rules: RuleRow[], commentText: string): boolean {
  if (rules.length === 0) return true
  const hay = commentText.slice(0, 2000)
  for (const r of rules) {
    try {
      const re = new RegExp(r.pattern, r.flags ?? undefined)
      if (re.test(hay)) return true
    } catch {
      // Invalid regex shouldn't crash the worker; treat as non-match.
      continue
    }
  }
  return false
}

function insertExecution(
  db: Database.Database,
  params: {
    id: string
    eventId: string
    automationId: string
    actionType: 'reply' | 'dm'
    status: 'queued' | 'skipped'
  },
) {
  db.prepare(
    `INSERT INTO automation_executions (id, event_id, automation_id, action_type, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(event_id, automation_id, action_type)
     DO NOTHING`,
  ).run(params.id, params.eventId, params.automationId, params.actionType, params.status)
}

export function executeWebhookEvent(
  db: Database.Database,
  args: { eventId: string; payloadJson: string },
): { executionsInserted: number; matchedAutomations: number } {
  const parsed = extractCommentEvent(args.payloadJson)
  if (!parsed) return { executionsInserted: 0, matchedAutomations: 0 }

  const automations = loadAutomationsForPost(db, parsed.igPostId)

  let executionsInserted = 0
  let matchedAutomations = 0

  for (const a of automations) {
    const rules = loadRules(db, a.id)
    const actions = loadActions(db, a.id)
    const matched = rulesMatch(rules, parsed.commentText)
    if (matched) matchedAutomations += 1

    for (const action of actions) {
      const status: 'queued' | 'skipped' = matched ? 'queued' : 'skipped'
      insertExecution(db, {
        id: crypto.randomUUID(),
        eventId: args.eventId,
        automationId: a.id,
        actionType: action.type,
        status,
      })
      executionsInserted += 1
    }
  }

  return { executionsInserted, matchedAutomations }
}
