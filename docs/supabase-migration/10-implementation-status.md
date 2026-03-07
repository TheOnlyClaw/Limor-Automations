# Implementation Status

This file tracks what has already been implemented from the Supabase migration plan.

Status: migration complete as of 2026-03-07. Supabase is the source of truth for auth, data, and runtime; legacy Fastify/SQLite services have been removed from the repo.

## Hosted project status

- target project: `Limor-Automations`
- project ref: `dpfbbodkvgtojrffmcaf`
- hosted schema has been applied
- hosted function secrets have been configured for local development origin and token encryption

Applied hosted migrations:

- `20260307101358_initial_app_schema`
- `20260307101915_schema_hardening`
- `20260307114851_automation_bundle_rpc`
- `20260307115535_automation_bundle_rpc_permissions`

Current hosted tables:

- `public.profiles`
- `public.instagram_connections`
- `public.instagram_posts`
- `public.automations`
- `public.automation_rules`
- `public.automation_actions`
- `public.instagram_webhook_events`
- `public.automation_executions`
- `app_private.meta_apps`

## Completed repo work

### 1. Supabase repo bootstrap

Done:

- added `supabase/config.toml`
- added hosted migrations in `supabase/migrations/`
- added `supabase/README.md`
- updated root `README.md` for hosted Supabase workflow

### 2. Frontend Supabase auth shell

Done in `apps/web/src/`:

- typed browser client in `lib/supabase.ts`
- generated database types in `lib/supabaseDatabase.ts`
- auth gate in `auth/AuthGate.tsx`
- email/password sign-in and sign-up page in `auth/LoginPage.tsx`
- session/profile sync hook in `auth/useSession.ts`

### 3. Browser API base cleanup

Done:

- removed the legacy browser API wrapper in `apps/web/src/lib/api.ts`
- removed the local Fastify proxy from `apps/web/vite.config.ts`

### 4. Connection management migration

Done:

- connection models and wrappers in `apps/web/src/connections/`
- settings UI moved to the connection concept in `apps/web/src/settings/sections/InstagramConnectionsSection.tsx`
- browser create/update/delete now call Supabase Edge Functions instead of writing tokens directly from the browser
- browser resolve/refresh actions now call Supabase Edge Functions

### 5. Shared Edge Function helpers

Done in `supabase/functions/_shared/`:

- auth helper
- Supabase client helpers
- CORS helpers
- crypto helpers for token encryption
- connection mappers
- Instagram Graph helper

### 6. Connection Edge Functions

Implemented in repo:

- `create-instagram-connection`
- `update-instagram-connection`
- `delete-instagram-connection`
- `resolve-instagram-connection`
- `refresh-instagram-connection`

Hosted deployment status:

- all five functions are deployed and aligned with the repo
- the refresh hardening patch is active in hosted Supabase

### 7. Dashboard automation migration

Done in repo:

- added Supabase automation wrappers in `apps/web/src/automations/`
- added atomic automation RPC migrations in `supabase/migrations/`
- applied the hosted automation RPC migrations
- dashboard automation reads now come from Supabase under RLS
- dashboard create/update writes now go through RPC instead of Fastify REST

### 8. Posts migration

Done in repo:

- added `supabase/functions/list-instagram-posts/index.ts`
- added browser wrapper in `apps/web/src/posts/postsApi.ts`
- dashboard post loading now uses the hosted `list-instagram-posts` Edge Function
- the function caches normalized rows into `public.instagram_posts` and updates `last_posts_sync_at`

Hosted deployment status:

- `list-instagram-posts` is active in the hosted project and aligned with the repo

### 9. Webhook runtime migration

Done in repo + hosted:

- added `supabase/functions/instagram-webhook`
- added `supabase/functions/retry-automation-executions`
- added `supabase/functions/refresh-instagram-tokens`
- added shared helpers for webhook parsing and delivery (`supabase/functions/_shared/webhook.ts`, `supabase/functions/_shared/instagramActions.ts`)
- extended Graph helpers for POST requests in `supabase/functions/_shared/instagramGraph.ts`

Hosted deployment status:

- deployed and validated in the hosted project (`instagram-webhook`, `retry-automation-executions`, `refresh-instagram-tokens`)
- all three functions set `verify_jwt = false` in repo to allow public webhook delivery

## Validation completed

Completed during implementation and cutover:

- `npm -w apps/web run lint`
- `npm -w apps/web exec tsc -b`
- hosted table creation verified through Supabase table inspection
- hosted Edge Function presence verified through Supabase function inspection
- `npm -w apps/web run lint` after the dashboard Supabase migration work
- `npm -w apps/web exec tsc -b` after the dashboard Supabase migration work
- end-to-end manual browser validation of create/resolve/refresh/delete against a real signed-in user
- end-to-end manual browser validation of dashboard post loading and automation save flows on the Supabase path
- end-to-end webhook validation against live comment events
- deployment of the latest local `refresh-instagram-connection` and `list-instagram-posts` patches

Validation runbook:

- `docs/supabase-migration/12-connection-validation-checklist.md` completed and retained as the historical validation record

## Remaining migration work

None. The Supabase migration is complete. Legacy Fastify/SQLite services have been removed from the repo.

## Notes

- Supabase Edge Functions handle webhook ingestion, execution, and token refresh in production.
- Connection management, posts, and automation CRUD are fully Supabase-backed.
- Legacy Fastify/SQLite services have been removed from the repo and are not part of the production path.
