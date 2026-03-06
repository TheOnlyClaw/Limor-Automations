-- 0008: execution log + idempotency

CREATE TABLE IF NOT EXISTS automation_executions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('reply','dm')),
  status TEXT NOT NULL CHECK (status IN ('queued','skipped','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(event_id) REFERENCES instagram_webhook_events(id) ON DELETE CASCADE,
  FOREIGN KEY(automation_id) REFERENCES post_automations(id) ON DELETE CASCADE,
  UNIQUE(event_id, automation_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_by_automation
  ON automation_executions(automation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_automation_executions_by_event
  ON automation_executions(event_id);
