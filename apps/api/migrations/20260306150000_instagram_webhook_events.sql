-- 0006 instagram webhook events (comments ingestion)

CREATE TABLE IF NOT EXISTS instagram_webhook_events (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_status
  ON instagram_webhook_events(status);
