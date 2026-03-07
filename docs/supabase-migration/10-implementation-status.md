# Implementation Status

This file tracks what has already been implemented from the Supabase migration plan.

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

- `apps/web/src/lib/api.ts` no longer assumes same-origin API calls
- `apps/web/vite.config.ts` only uses the local Fastify proxy when `VITE_API_BASE_URL` is unset

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

- all five functions exist in the hosted project and are active
- one follow-up redeploy for `refresh-instagram-connection` hit a Supabase internal deploy error, so the repo contains a slightly newer hardening patch than the currently active hosted version
- hosted versions currently observed: `create-instagram-connection` v2, `update-instagram-connection` v2, `delete-instagram-connection` v2, `resolve-instagram-connection` v1, `refresh-instagram-connection` v1
- the meaningful hosted-vs-repo delta is on `refresh-instagram-connection`: the repo adds a missing-`access_token` guard and normalizes the stored `refresh_error` message
- a fresh redeploy attempt on 2026-03-07 also failed with a Supabase internal deploy error, so hosted `refresh-instagram-connection` is still on v1

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

- `list-instagram-posts` is active in the hosted project at version `1`
- a follow-up redeploy attempt for the latest local hardening patch hit a Supabase internal deploy error, so hosted `list-instagram-posts` is slightly behind the repo

## Validation completed

Completed during implementation:

- `npm -w apps/web run lint`
- `npm -w apps/web exec tsc -b`
- hosted table creation verified through Supabase table inspection
- hosted Edge Function presence verified through Supabase function inspection
- `npm -w apps/web run lint` after the dashboard Supabase migration work
- `npm -w apps/web exec tsc -b` after the dashboard Supabase migration work

Not yet completed:

- end-to-end manual browser validation of create/resolve/refresh/delete against a real signed-in user
- deployment of the latest local `refresh-instagram-connection` hardening patch if Supabase deploy stops failing
- end-to-end manual browser validation of dashboard post loading and automation save flows on the Supabase path
- deployment of the latest local `list-instagram-posts` hardening patch if Supabase deploy stops failing

Before starting the next dashboard slice in `docs/supabase-migration/11-dashboard-slice-plan.md`, finish or consciously waive these two items. They are not large feature blocks, but they are the remaining confidence checks for the connection migration that Slice B will build on.

Tracking note:

- use `docs/supabase-migration/12-connection-validation-checklist.md` as the concrete validation runbook and hosted drift record for this checkpoint

## Remaining migration work

Still open:

- migrate webhook ingestion and execution runtime to Supabase Edge Functions
- retire old Fastify and worker paths once the Supabase path is fully validated

Next planned slice:

- `docs/supabase-migration/11-dashboard-slice-plan.md` is the implementation plan for the dashboard migration, but it should begin only after the open validation/deploy follow-up above has been addressed.

## Notes

- the current codebase is in a mixed state on purpose: auth and connection management are on the Supabase path, while dashboard automations and post loading still depend on the older Fastify path
- the current codebase is still mixed on purpose, but the browser-facing dashboard data path is now on Supabase: auth, connections, posts, and automation CRUD all use Supabase-backed flows, while webhook ingestion and execution still depend on the older Fastify/worker runtime
- temporary risk was explicitly accepted on 2026-03-07 so Slice B could proceed before the remaining connection validation and hosted refresh redeploy were complete
- hosted security advisors are much cleaner now; the remaining item seen during setup was Supabase Auth leaked-password protection being disabled in project settings
