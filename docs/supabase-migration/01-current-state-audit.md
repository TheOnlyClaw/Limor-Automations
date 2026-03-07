# Current State Audit

## Monorepo shape

- `apps/api` is the main Fastify API.
- `apps/web` is a Vite + React frontend.
- `apps/webhooks` is a second Fastify service dedicated to Instagram webhook ingestion.
- Persistence is local SQLite through `better-sqlite3`.

## What exists today

### API service

The API service in `apps/api/src/server.ts`:

- opens SQLite on boot
- applies SQL migrations from `apps/api/migrations`
- exposes token CRUD, Instagram post fetch, token refresh, automation CRUD, and automation execution history
- runs an in-process interval that refreshes Instagram tokens before expiry

Current API routes:

- `GET /health`
- `GET /api/v1/ping`
- `POST/GET/GET:id/PATCH:id/DELETE:id /api/v1/instagram-tokens`
- `POST /api/v1/instagram-tokens/:id/refresh`
- `POST /api/v1/instagram-tokens/:id/resolve-ids`
- `GET /api/v1/instagram/posts?tokenId=...`
- `POST/GET/GET:id/PATCH:id/DELETE:id /api/v1/automations`
- `GET /automations/:id/executions` (note: this one is not namespaced under `/api/v1`)

### Webhook service

The webhook service in `apps/webhooks/src/server.ts`:

- shares the same SQLite DB and migration folder as `apps/api`
- enables raw request body capture
- verifies Instagram webhook challenge and HMAC signature
- persists webhook events into the database

This split already hints at the future Supabase design: request ingestion is separate from the main UI/API flows.

### Frontend

The web app in `apps/web/src`:

- is a small SPA with hand-rolled routing
- has no auth
- talks to the backend through relative `/api/...` fetch calls
- stores and reveals raw Instagram access tokens in the UI

Main screens:

- `Dashboard` - selects a token, loads Instagram posts, and configures per-post automations
- `Settings` - creates, edits, refreshes, resolves, copies, and deletes Instagram tokens

## Current data model

SQLite migrations define these tables:

### `instagram_tokens`

Stores the Instagram access token and account identity data.

Columns today:

- `id`
- `label`
- `access_token`
- `ig_user_id`
- `page_id`
- `expires_at`
- `last_refreshed_at`
- `refresh_status`
- `refresh_error`
- `created_at`
- `updated_at`

### `post_automations`

One automation per Instagram post and token pair in practice.

Columns today:

- `id`
- `token_id`
- `ig_post_id`
- `name`
- `enabled`
- `created_at`
- `updated_at`

### `post_automation_rules`

Regex rules attached to an automation.

### `post_automation_actions`

Actions attached to an automation.

- action types are `reply` or `dm`
- each action stores a text template

### `instagram_webhook_events`

Queue/inbox table for raw webhook deliveries.

Columns today include:

- `dedupe_key`
- `status`
- `attempts`
- `next_attempt_at`
- `locked_at`
- `locked_by`
- `processed_at`
- `last_error`
- `payload_json`

### `automation_executions`

Execution log plus idempotency guard for actions generated from events.

## Current runtime behavior

### Token lifecycle

- tokens are inserted manually in the settings screen
- `/resolve-ids` looks up the Instagram user id via Graph API
- `/refresh` calls the long-lived token refresh endpoint
- the API server also auto-refreshes due tokens on an interval

### Post loading

- the dashboard loads tokens first
- the selected token is used to call Instagram Graph `me/media` or `{ig_user_id}/media`
- posts are cached in memory only, inside the Fastify process

### Automation execution flow

1. Meta sends a webhook.
2. The webhook service verifies the request and inserts a row into `instagram_webhook_events`.
3. A polling worker claims pending events with DB locks.
4. The worker parses comment events, loads matching automations, evaluates regex rules, and inserts `automation_executions` rows.
5. The worker then sends Graph API replies or DMs and updates execution status.

## Constraints that matter for the migration

### Good candidates to keep conceptually

- queue table for webhook deliveries
- separate execution log table
- explicit retry/backoff fields
- server-side token refresh
- minimal frontend state model

### Things that do not translate well to free static/serverless hosting

- local SQLite file
- process-local memory cache
- always-on `setInterval` jobs
- long-running polling worker process
- single global env-secret model for all users
- browser visibility of raw access tokens

### Security gaps to fix during migration

- no user authentication
- no row ownership model
- raw access tokens are returned to the browser
- secrets are stored as plain DB fields
- one global webhook secret assumes one Meta app for everyone

## Migration conclusion

The app is already small and modular enough to migrate without a full rewrite, but the hosting/runtime model must change:

- SQLite + long-lived workers -> Postgres + scheduled/serverless functions
- anonymous internal tool -> authenticated multi-user product
- single-tenant secrets -> per-user or per-connection secret ownership
- REST endpoints tightly coupled to the Fastify process -> Supabase tables, RPC, and Edge Functions

One important optimization for the new platform:

- the current queued worker flow exists mostly because the app runs as long-lived processes
- in Supabase, the primary path should be immediate execution during webhook handling
- a queue table should remain, but mainly as a durability and retry mechanism rather than the first execution path
