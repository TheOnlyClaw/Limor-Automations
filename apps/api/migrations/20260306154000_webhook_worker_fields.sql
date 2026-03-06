-- 0007 webhook event worker fields
-- Note: SQLite supports ADD COLUMN but not DROP COLUMN.

ALTER TABLE instagram_webhook_events ADD COLUMN next_attempt_at TEXT;
ALTER TABLE instagram_webhook_events ADD COLUMN locked_at TEXT;
ALTER TABLE instagram_webhook_events ADD COLUMN locked_by TEXT;
ALTER TABLE instagram_webhook_events ADD COLUMN processed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_due
  ON instagram_webhook_events(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_locked
  ON instagram_webhook_events(locked_at);
