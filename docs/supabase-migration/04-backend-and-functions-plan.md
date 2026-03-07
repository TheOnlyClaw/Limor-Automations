# Backend And Functions Plan

## Goal

Replace the current Fastify API, webhook service, and polling workers with Supabase-native primitives, but execute automations immediately when webhooks arrive whenever possible.

## What should move to Edge Functions

### 1. Instagram connection bootstrap

Replace current endpoints:

- `POST /api/v1/instagram-tokens`
- `POST /api/v1/instagram-tokens/:id/resolve-ids`
- `POST /api/v1/instagram-tokens/:id/refresh`

with functions such as:

- `create-instagram-connection`
- `resolve-instagram-connection`
- `refresh-instagram-connection`

Why:

- these require access to secrets and third-party APIs
- they should run with server privileges

### 2. Post sync/fetch

Two good patterns exist.

#### Pattern A - on-demand proxy fetch

Browser calls an Edge Function that:

- loads the user's encrypted access token
- fetches Instagram posts from Graph API
- optionally stores a cache snapshot
- returns normalized post data

#### Pattern B - scheduled sync plus direct table reads

Scheduled function syncs posts into `instagram_posts`, then the browser reads them under RLS.

Recommendation:

- start with Pattern A for speed of implementation
- move to Pattern B if you need faster dashboards, better caching, or historical post state

### 3. Webhook ingestion

Replace `apps/webhooks` with a public Edge Function.

Responsibilities:

- answer the Meta webhook challenge request
- verify `x-hub-signature-256`
- resolve the tenant/app secret
- dedupe and insert event rows
- attempt immediate rule evaluation and action execution
- always return a safe response to avoid repeated hammering on non-recoverable cases

Recommended behavior inside the webhook function:

1. Persist the webhook event.
2. Parse the comment payload.
3. Load matching automations.
4. Insert execution rows.
5. Attempt reply/DM delivery immediately.
6. Mark each execution as `succeeded`, `failed`, or `queued` for retry.

This should be the primary path for low and moderate traffic.

### 4. Retry processing

Do not replace the old polling worker with another polling worker unless traffic forces it later.

Recommended function: `retry-automation-executions`

Responsibilities:

- claim failed or deferred execution rows
- reload the needed event and connection context
- retry replies or DMs with bounded backoff
- update attempts, status, and last error

### 5. Action execution

Most action execution should happen inside the webhook function itself.

Keep a separate function only as a fallback runtime for retries or deferred jobs.

Responsibilities:

- send replies or DMs through Graph API
- be reusable both from the webhook function and the retry function
- update status, attempts, and last error

### 6. Scheduled token refresh

Replace the in-process timer from `apps/api/src/server.ts`.

Recommended function: `refresh-instagram-tokens`

Responsibilities:

- query due connections
- refresh long-lived tokens
- update expiry and refresh metadata
- lock rows or use a claim/update pattern to avoid duplicate work

## RPC vs Edge Functions

Use this rule:

- use direct table access under RLS for plain CRUD on safe user-owned data
- use Edge Functions for anything involving secrets, third-party API calls, webhook verification, or privileged writes

For this app, that means:

### Direct browser CRUD is fine for

- automations
- rules
- actions
- profiles
- cached posts, if you add a posts table

### Edge Functions are required for

- token creation/import
- token refresh
- IG account id resolution
- webhook handling
- sending replies and DMs
- any Meta app credential management

## Suggested function list

- `create-instagram-connection`
- `update-instagram-connection`
- `delete-instagram-connection`
- `resolve-instagram-connection`
- `refresh-instagram-connection`
- `list-instagram-posts`
- `instagram-webhook`
- `process-instagram-events`
- `run-automation-executions`
- `refresh-instagram-tokens`

You can merge some of these later, but keeping them separate during migration makes debugging easier.

## Endpoint-to-function mapping

### Current token CRUD

- current API returns raw `accessToken`
- new design should never return the raw token after creation

Suggested browser response shape:

- `id`
- `label`
- `igUserId`
- `pageId`
- `expiresAt`
- `lastRefreshedAt`
- `refreshStatus`
- `refreshError`
- `hasStoredAccessToken: true`

### Current posts endpoint

Today the browser sends `tokenId` to `/api/v1/instagram/posts`.

New design:

- browser sends `connectionId`
- function validates ownership
- function resolves token server-side

### Current automation endpoints

These can stay structurally similar, but each row must carry ownership.

Recommended choice:

- move them from custom REST to Supabase table operations first
- add small repository wrappers in the frontend to keep the UI unchanged

## Queue and retry strategy

Keep the current explicit state model.

Recommended statuses:

- events: `pending`, `processing`, `processed`, `failed`
- executions: `queued`, `skipped`, `succeeded`, `failed`

Keep fields for:

- `attempts`
- `next_attempt_at`
- `locked_at`
- `locked_by`
- `last_error`

This is one of the strongest parts of the current design and should remain, but it becomes a recovery path rather than the main execution path.

## OAuth and onboarding plan

You currently paste tokens manually. Supabase migration is a good time to support a real onboarding flow.

Two phases:

### Phase 1 - keep manual token import

- fastest migration path
- least product risk
- no need to solve the full Meta OAuth UI immediately

### Phase 2 - add guided Meta connect flow

- user clicks `Connect Instagram`
- browser starts an Edge Function or redirect flow
- function exchanges auth code for token
- function stores connection and syncs ids

Recommendation:

- migrate to Supabase first with manual token import still supported
- add full Meta OAuth once the new data model and auth are stable

## Importing existing SQLite data

Suggested sequence:

1. Export current SQLite rows to JSON or CSV.
2. Create the first Supabase user that will own imported data.
3. Insert `instagram_connections` first.
4. Insert `automations`, `automation_rules`, and `automation_actions`.
5. Optionally skip old webhook events/executions unless you want audit history.
6. Validate that the dashboard renders identical post/automation state for the imported owner.

## Recommended final runtime

Primary path:

- webhook arrives
- event is stored
- automation executes immediately

Fallback path:

- if immediate execution fails, times out, or is deferred, the retry function picks it up later

This keeps latency low without dropping reliability.
