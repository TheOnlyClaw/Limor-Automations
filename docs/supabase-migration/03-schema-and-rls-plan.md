# Schema And RLS Plan

## Design goals

- every row belongs to a signed-in user
- secrets never become browser-readable by default
- current SQLite tables map closely enough that migration stays mechanical
- webhook and execution flows remain explicit and auditable

## Proposed core tables

### `profiles`

One row per `auth.users` user.

Suggested columns:

- `id uuid primary key references auth.users(id)`
- `email text`
- `display_name text`
- `created_at timestamptz`
- `updated_at timestamptz`

### `meta_apps`

Store Meta app credentials separately from Instagram account connections.

Suggested columns:

- `id uuid primary key`
- `owner_user_id uuid not null`
- `label text not null`
- `mode text not null check (mode in ('shared','user_owned'))`
- `meta_app_id text`
- `meta_app_secret_encrypted text`
- `webhook_verify_token_encrypted text`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

Notes:

- In shared-app mode you may only have one internal row.
- In user-owned mode each user gets one or more rows here.

### `instagram_connections`

This replaces `instagram_tokens` and becomes the main user-owned account record.

Suggested columns:

- `id uuid primary key`
- `owner_user_id uuid not null`
- `meta_app_id uuid null references meta_apps(id)`
- `label text`
- `access_token_encrypted text not null`
- `ig_user_id text`
- `page_id text`
- `token_expires_at timestamptz`
- `last_refreshed_at timestamptz`
- `refresh_status text`
- `refresh_error text`
- `connection_status text not null default 'active'`
- `last_posts_sync_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Do not expose `access_token_encrypted` to the browser.

### `instagram_posts`

Optional but recommended.

Suggested columns:

- `id text not null`
- `connection_id uuid not null`
- `caption text`
- `media_type text`
- `media_url text`
- `thumbnail_url text`
- `permalink text`
- `posted_at timestamptz`
- `raw_json jsonb`
- `synced_at timestamptz`

Primary key suggestion:

- `(connection_id, id)`

Why add this table:

- avoids repeated browser-triggered Graph fetches
- enables server-side sync jobs
- makes the dashboard faster and more cache-friendly

### `automations`

Replace `post_automations`.

Suggested columns:

- `id uuid primary key`
- `owner_user_id uuid not null`
- `connection_id uuid not null references instagram_connections(id)`
- `ig_post_id text not null`
- `name text`
- `enabled boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique index recommendation:

- `(connection_id, ig_post_id)` if you want one automation per post

### `automation_rules`

- `id uuid primary key`
- `automation_id uuid not null references automations(id) on delete cascade`
- `pattern text not null`
- `flags text`
- `created_at timestamptz`

### `automation_actions`

- `id uuid primary key`
- `automation_id uuid not null references automations(id) on delete cascade`
- `type text not null check (type in ('reply','dm'))`
- `template text not null`
- `created_at timestamptz`

### `instagram_webhook_events`

Keep the queue table concept.

Suggested columns:

- `id uuid primary key`
- `owner_user_id uuid not null`
- `connection_id uuid null references instagram_connections(id)`
- `meta_app_id uuid null references meta_apps(id)`
- `dedupe_key text not null`
- `payload jsonb not null`
- `status text not null`
- `attempts integer not null default 0`
- `next_attempt_at timestamptz`
- `locked_at timestamptz`
- `locked_by text`
- `processed_at timestamptz`
- `last_error text`
- `received_at timestamptz not null default now()`

Unique index recommendation:

- `(connection_id, dedupe_key)`

### `automation_executions`

Keep the execution log and idempotency table.

Suggested columns:

- `id uuid primary key`
- `owner_user_id uuid not null`
- `event_id uuid not null references instagram_webhook_events(id) on delete cascade`
- `automation_id uuid not null references automations(id) on delete cascade`
- `action_type text not null check (action_type in ('reply','dm'))`
- `status text not null check (status in ('queued','skipped','succeeded','failed'))`
- `attempts integer not null default 0`
- `last_error text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique index recommendation:

- `(event_id, automation_id, action_type)`

## RLS plan

## Browser-readable tables

Enable RLS and allow users to access only their rows for:

- `profiles`
- `instagram_connections` without the encrypted token column in browser-facing queries
- `instagram_posts`
- `automations`
- `automation_rules`
- `automation_actions`
- `automation_executions`

Policy pattern:

- `owner_user_id = auth.uid()`

## Private tables or private columns

Do not expose direct browser reads for:

- `meta_apps`
- encrypted token columns
- webhook raw payloads unless you explicitly want them visible in the UI

Access pattern:

- Edge Functions use the service role
- browser calls functions for secret-bearing operations

## Secrets strategy

Minimum acceptable:

- store encrypted values in private columns
- only Edge Functions decrypt/use them

Preferred:

- use a dedicated secret storage approach supported by your Supabase setup
- keep plaintext secrets out of client queries, logs, and execution tables

Never return these to the browser:

- Meta app secret
- webhook verify token
- raw long-lived Instagram access token

## Migration mapping from current SQLite tables

### `instagram_tokens` -> `instagram_connections`

- add `owner_user_id`
- rename token field to encrypted storage
- keep refresh metadata

### `post_automations` -> `automations`

- replace `token_id` with `connection_id`
- add `owner_user_id`

### `post_automation_rules` -> `automation_rules`

- mostly unchanged

### `post_automation_actions` -> `automation_actions`

- mostly unchanged

### `instagram_webhook_events` -> `instagram_webhook_events`

- switch `payload_json` to `jsonb`
- add ownership and connection/app references

### `automation_executions` -> `automation_executions`

- mostly unchanged
- add `owner_user_id`

## Data migration notes

Because the current app is single-tenant, initial migration is simple:

- create one seed user for existing data
- assign all current rows to that user during import
- later, create true per-user onboarding flows for new accounts
