-- 0005 — Post automations CRUD (regex rules)

CREATE TABLE IF NOT EXISTS post_automations (
  id TEXT PRIMARY KEY NOT NULL,
  token_id TEXT NOT NULL,
  ig_post_id TEXT NOT NULL,
  name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (token_id) REFERENCES instagram_tokens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_automations_token_id ON post_automations(token_id);
CREATE INDEX IF NOT EXISTS idx_post_automations_ig_post_id ON post_automations(ig_post_id);

CREATE TABLE IF NOT EXISTS post_automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  automation_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  flags TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (automation_id) REFERENCES post_automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_automation_rules_automation_id ON post_automation_rules(automation_id);

CREATE TABLE IF NOT EXISTS post_automation_actions (
  id TEXT PRIMARY KEY NOT NULL,
  automation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  template TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (automation_id) REFERENCES post_automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_automation_actions_automation_id ON post_automation_actions(automation_id);
