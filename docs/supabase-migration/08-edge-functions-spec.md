# Edge Functions Spec

Project target:

- Supabase project `Limor-Automations`
- project id/ref: `dpfbbodkvgtojrffmcaf`
- current DB state: empty `public` schema at the time of planning

## Principles

- use the browser client for plain user-owned CRUD under RLS
- use Edge Functions for secrets, Meta API calls, webhook verification, and scheduled work
- prefer immediate execution at webhook time instead of queue-first polling
- instantiate the Supabase client inside each function request
- forward the caller `Authorization` header when the function should run under user context
- use the service role only for privileged server-side flows

## Functions to implement first

### `create-instagram-connection`

Purpose:

- create a user-owned connection from a manually pasted long-lived access token

Auth:

- required

Input:

```json
{
  "label": "optional label",
  "accessToken": "...",
  "metaAppId": "optional uuid"
}
```

Behavior:

- validate caller session
- validate payload
- store encrypted token in `public.instagram_connections`
- optionally attach `meta_app_id`
- return safe connection shape without the token

### `resolve-instagram-connection`

Purpose:

- replace `/api/v1/instagram-tokens/:id/resolve-ids`

Auth:

- required

Input:

```json
{
  "connectionId": "uuid"
}
```

Behavior:

- confirm the connection belongs to the caller
- load the stored token with service role
- call Graph API `me?fields=id`
- write `ig_user_id` and `page_id`
- return updated safe connection

### `refresh-instagram-connection`

Purpose:

- replace manual token refresh endpoint

Auth:

- required

Input:

```json
{
  "connectionId": "uuid"
}
```

Behavior:

- confirm ownership
- refresh the long-lived token server-side
- update `access_token`, `token_expires_at`, `last_refreshed_at`, `refresh_status`, `refresh_error`
- return safe connection status

### `list-instagram-posts`

Purpose:

- replace `/api/v1/instagram/posts`

Auth:

- required

Input:

```json
{
  "connectionId": "uuid",
  "limit": 30,
  "sync": true
}
```

Behavior:

- confirm ownership
- load token server-side
- fetch Graph API media
- normalize result to current frontend shape
- upsert `public.instagram_posts`
- update `last_posts_sync_at`
- return `{ items: [...] }`

Recommendation:

- keep this function even if the UI later reads cached posts directly; it gives you one stable sync entrypoint

### `instagram-webhook`

Purpose:

- replace `apps/webhooks`

Auth:

- public endpoint

Modes:

- `GET` for challenge verification
- `POST` for event ingestion

Behavior:

- resolve tenant/app secret from route params or request metadata
- validate verify token for challenge flow
- validate `x-hub-signature-256` for POST
- compute a dedupe key
- insert into `public.instagram_webhook_events`
- load matching automations immediately when the payload is a supported comment event
- insert `public.automation_executions`
- attempt reply/DM delivery immediately
- leave failed/deferred executions retryable with backoff metadata
- return `200` on accepted deliveries

Path recommendation:

- shared app: `/functions/v1/instagram-webhook`
- user-owned apps later: `/functions/v1/instagram-webhook/:metaAppId`

### `retry-automation-executions`

Purpose:

- recover failed or deferred deliveries after webhook-time execution

Auth:

- internal scheduled use only

Behavior:

- claim retryable execution rows
- load secret token and sender identity
- send reply or DM through Graph API
- update attempts and status

### Shared delivery helper

Purpose:

- centralize reply/DM execution logic so it can be used both from `instagram-webhook` and `retry-automation-executions`

Behavior:

- send the Graph API request
- normalize success/error handling
- write attempts, status, and last error consistently

### `refresh-instagram-tokens`

Purpose:

- replace in-process token refresh interval

Auth:

- internal scheduled use only

Behavior:

- find due connections
- refresh them in bounded batches
- update refresh metadata

## Environment and secrets

Function secrets to configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FB_GRAPH_VERSION`
- optional shared app secrets if you start in shared-app mode

For scheduled invocations:

- store `project_url`
- store cron bearer token in Vault
- call functions with `pg_cron` + `pg_net`

## Scheduling plan

Suggested jobs:

- every 5 minutes: `refresh-instagram-tokens`
- every 15-30 seconds: `retry-automation-executions`
- optional every 15 minutes: `list-instagram-posts` sync job for stale connections

## Files this implies in the repo

Recommended new structure:

- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/meta.ts`
- `supabase/functions/create-instagram-connection/index.ts`
- `supabase/functions/resolve-instagram-connection/index.ts`
- `supabase/functions/refresh-instagram-connection/index.ts`
- `supabase/functions/list-instagram-posts/index.ts`
- `supabase/functions/instagram-webhook/index.ts`
- `supabase/functions/retry-automation-executions/index.ts`
- `supabase/functions/refresh-instagram-tokens/index.ts`
