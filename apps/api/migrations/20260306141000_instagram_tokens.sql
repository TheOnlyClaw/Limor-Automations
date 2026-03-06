-- 0002 — instagram token CRUD

CREATE TABLE IF NOT EXISTS instagram_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT,
  access_token TEXT NOT NULL,
  ig_user_id TEXT,
  expires_at TEXT,
  last_refreshed_at TEXT,
  refresh_status TEXT,
  refresh_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instagram_tokens_created_at ON instagram_tokens(created_at);
