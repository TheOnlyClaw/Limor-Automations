-- 0009 — add page_id to instagram_tokens for bootstrap

ALTER TABLE instagram_tokens ADD COLUMN page_id TEXT;

CREATE INDEX IF NOT EXISTS idx_instagram_tokens_page_id ON instagram_tokens(page_id);
