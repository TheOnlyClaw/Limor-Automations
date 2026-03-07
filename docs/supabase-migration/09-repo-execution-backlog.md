# Repo Execution Backlog

This is the concrete implementation order for this repository.

Status: migration complete as of 2026-03-07. This backlog is archived and kept for reference. Legacy Fastify/SQLite services have been removed from the repo; file path references below are historical.

## Current progress snapshot

Completed (migration complete):

- `0. Bootstrap Supabase into the repo`
- `1. Add frontend Supabase client and auth shell`
- `2. Replace browser fetch wrapper assumptions`
- `3. Migrate connection management from token CRUD`
- `4. Migrate automation CRUD to Supabase tables`
- `5. Migrate post loading`
- `6. Add shared Edge Function helpers` (current subset needed for connections)
- `7. Implement connection Edge Functions`
- `8. Implement posts Edge Function`
- `9. Implement webhook runtime (repo + hosted)`
- remaining runtime validation and Fastify retirement steps completed during cutover

Still pending:

- none (migration complete)

See `docs/supabase-migration/10-implementation-status.md` for the detailed status log.

## 0. Bootstrap Supabase into the repo

- add `supabase/config.toml`
- add the initial hosted schema migration in `supabase/migrations/`
- add `supabase/functions/` shared helpers
- add root docs for hosted Supabase development

Why first:

- it creates the destination architecture before touching the app code

## 1. Add frontend Supabase client and auth shell

Files to add:

- `apps/web/src/lib/supabase.ts`
- `apps/web/src/auth/AuthGate.tsx`
- `apps/web/src/auth/LoginPage.tsx`
- `apps/web/src/auth/useSession.ts`

Files to change:

- `apps/web/package.json`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`

Implementation notes:

- add `@supabase/supabase-js`
- initialize browser client from `VITE_SUPABASE_URL` and prefer `VITE_SUPABASE_PUBLISHABLE_KEY` (`VITE_SUPABASE_ANON_KEY` only as a legacy fallback)
- wrap the app in an auth-aware shell
- add `/login` route handling to the current hand-rolled router or replace routing with React Router if you choose to modernize

## 2. Replace browser fetch wrapper assumptions

Files to change:

- `apps/web/src/lib/api.ts`
- `apps/web/vite.config.ts`

Implementation notes:

- stop assuming same-origin `/api`
- keep `apps/web/src/lib/api.ts` only for invoking Edge Functions if helpful
- remove the Vite proxy once no browser route depends on local Fastify

## 3. Migrate connection management from token CRUD

Files to add:

- `apps/web/src/connections/connectionsApi.ts`
- `apps/web/src/connections/types.ts`

Files to change:

- `apps/web/src/settings/instagramTokensApi.ts`
- `apps/web/src/settings/sections/InstagramTokensSection.tsx`
- `apps/web/src/settings/SettingsPage.tsx`

Implementation notes:

- rename the concept from token to connection in the UI and API wrappers
- replace token list/create/update/delete calls with Supabase table reads plus Edge Function invokes
- remove reveal/copy raw token behavior
- keep refresh and resolve actions, but back them with function calls

## 4. Migrate automation CRUD to Supabase tables

Files to add:

- `apps/web/src/automations/automationsApi.ts`
- `apps/web/src/automations/mappers.ts`

Database work to add:

- new Supabase migration for atomic automation RPC writes

Files to change:

- `apps/web/src/dashboard/automationsApi.ts`
- `apps/web/src/dashboard/automationDraft.ts`
- `apps/web/src/dashboard/DashboardPage.tsx`
- `apps/web/src/dashboard/AutomationDialog.tsx`

Implementation notes:

- replace REST reads with typed Supabase nested selects
- use RPC for create and update so rule/action replacement stays atomic
- preserve existing draft logic and component behavior
- fetch `automations` with joined `automation_rules` and `automation_actions`
- re-fetch the saved automation bundle after each RPC write instead of hand-assembling the response in the client

## 5. Migrate post loading

Files to add:

- `apps/web/src/posts/postsApi.ts`
- `supabase/functions/list-instagram-posts/index.ts`

Files to change:

- `apps/web/src/dashboard/instagramPostsApi.ts`
- `apps/web/src/dashboard/DashboardPage.tsx`

Implementation notes:

- replace `/api/v1/instagram/posts` with function invocation to `list-instagram-posts`
- send `connectionId` instead of `tokenId`
- keep the returned shape compatible with the current `InstagramPost` type where possible
- have the function update `instagram_posts` and `last_posts_sync_at` so cached direct reads stay available later

## 6. Add shared Edge Function helpers

Files to add:

- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/meta.ts`
- `supabase/functions/_shared/crypto.ts`
- `supabase/functions/_shared/webhook.ts`

Implementation notes:

- centralize user-context client creation
- centralize service-role client creation
- centralize Graph API wrappers and signature verification

## 7. Implement connection Edge Functions

Files to add:

- `supabase/functions/create-instagram-connection/index.ts`
- `supabase/functions/update-instagram-connection/index.ts`
- `supabase/functions/delete-instagram-connection/index.ts`
- `supabase/functions/resolve-instagram-connection/index.ts`
- `supabase/functions/refresh-instagram-connection/index.ts`

Repo code to retire after successful migration:

- `apps/api/src/routes/instagramTokens.ts`
- `apps/api/src/routes/instagramBootstrap.ts`
- `apps/api/src/routes/instagramRefresh.ts`
- parts of `apps/api/src/lib/instagramTokenRefresh.ts`

## 8. Implement posts Edge Function

Files to add:

- `supabase/functions/list-instagram-posts/index.ts`

Repo code to retire after successful migration:

- `apps/api/src/routes/instagramPosts.ts`

## 9. Implement webhook ingestion and worker replacement

Files to add:

- `supabase/functions/instagram-webhook/index.ts`
- `supabase/functions/retry-automation-executions/index.ts`
- `supabase/functions/refresh-instagram-tokens/index.ts`

Repo code to retire after successful migration:

- `apps/webhooks/src/server.ts`
- `apps/webhooks/src/routes/instagramWebhooks.ts`
- `apps/api/src/worker/events.ts`
- `apps/api/src/worker/executeEvent.ts`
- `apps/api/src/worker/executions.ts`
- timer logic in `apps/api/src/server.ts`

Implementation notes:

- `instagram-webhook` should persist the event and try to execute the automation immediately
- `retry-automation-executions` exists only as a fallback safety net for failed/deferred deliveries
- do not rebuild the old queue-first polling architecture unless real traffic forces it later

## 10. Add execution history UI

Files to add:

- `apps/web/src/executions/executionsApi.ts`
- `apps/web/src/executions/ExecutionList.tsx`

Files to change:

- `apps/web/src/dashboard/DashboardPage.tsx`

Implementation notes:

- read `automation_executions` under RLS
- expose the behavior already present in the backend data model

## 11. Remove Fastify dependencies from the app path

Files updated during cutover:

- `package.json`
- `README.md`

Implementation notes:

- `apps/api` and `apps/webhooks` removed after the Supabase path was fully validated

## 12. Suggested delivery slices

### Slice A - auth + schema + connections

Deliverables:

- Supabase schema
- auth shell
- connection management screen migrated

### Slice B - dashboard data path

Deliverables:

- posts function
- automation CRUD on Supabase
- dashboard fully functional without Fastify

### Slice C - automation runtime

Deliverables:

- webhook function
- immediate webhook-time execution
- retry fallback runner
- execution history

### Slice D - cleanup and cutover

Deliverables:

- remove NAS requirement
- remove SQLite/Fastify path from the production architecture

## Recommended next implementation sequence

Highest-leverage next batch:

1. implement `supabase/functions/instagram-webhook`
2. migrate automation matching and execution writes to Supabase-backed runtime code
3. implement `supabase/functions/retry-automation-executions`
4. add execution history UI on top of `automation_executions`
5. retire the old Fastify and worker path once runtime behavior is validated

Validation and cleanup that should run alongside that batch:

1. manually validate create/resolve/refresh/delete against a real signed-in user
2. manually validate dashboard post loading and automation saves on the Supabase path
3. redeploy the latest `refresh-instagram-connection` and `list-instagram-posts` patches if Supabase deploy stops failing

That moves the project from a Supabase-backed dashboard into a Supabase-backed runtime, which is the main remaining migration milestone.
