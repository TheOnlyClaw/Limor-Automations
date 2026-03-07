# Rollout Checklist

## Status

Migration complete as of 2026-03-07. Supabase is the primary runtime; legacy Fastify/SQLite services are no longer part of production and have been removed from the repo. The phases below are retained as a historical checklist.

## Phase 0 - decisions

- choose shared Meta app vs bring-your-own Meta app
- choose Vercel vs GitHub Pages for the frontend
- decide whether post data will be proxied on demand or synced into a table
- decide whether to migrate historical webhook/execution rows or only live configuration data

## Phase 1 - Supabase foundation

- create the Supabase project
- enable Auth
- create `profiles`
- create the core Postgres tables
- add RLS policies
- define secret storage strategy
- generate DB types for the frontend

Exit criteria:

- a signed-in user can read only their own rows
- no secret-bearing column is browser-readable

## Phase 2 - frontend auth shell

- add Supabase browser client
- add login/logout flow
- protect dashboard and settings routes
- create profile bootstrap logic

Exit criteria:

- anonymous users cannot access app data
- signed-in users land in the app with a valid profile row

## Phase 3 - connection migration

- implement create/update/delete connection Edge Functions
- implement resolve-id and refresh Edge Functions
- migrate settings UI from token CRUD to connection management
- remove token reveal/copy from the UI

Exit criteria:

- a user can add a connection without the raw token ever being returned later
- refresh and resolve actions work end to end

## Phase 4 - automation migration

- move automations, rules, and actions to Supabase tables
- add ownership-aware queries
- keep the existing dashboard UX as close as possible

Exit criteria:

- a user can configure post automations for only their own connections

## Phase 5 - post loading migration

- implement either on-demand post fetch or cached post sync
- update dashboard data loading
- remove Vite proxy and same-origin API assumptions

Exit criteria:

- dashboard loads posts without the Fastify API

## Phase 6 - webhook and worker migration

- implement public webhook Edge Function
- implement immediate execution in the webhook path
- implement scheduled retry runner for failed/deferred executions
- implement scheduled token refresh job
- test retries, idempotency, and duplicate webhook handling

Exit criteria:

- comment webhooks create events
- matching automations execute immediately in the webhook path
- replies/DMs are sent successfully
- failed jobs retry safely

## Phase 7 - data import and validation

- export SQLite configuration data
- import into Supabase and assign to a seed user
- validate connection counts, automation counts, and action counts
- run a live end-to-end webhook test on a non-production Instagram account

Exit criteria:

- imported users see the same functional configuration in the new app

## Phase 8 - cutover

- deploy frontend to Vercel or GitHub Pages
- update Meta webhook callback URLs
- update auth redirect URLs
- stop writing to SQLite
- keep old service available briefly for rollback visibility

Exit criteria:

- new traffic only hits Supabase-backed flows
- no critical feature still depends on the NAS deployment

## Post-cutover cleanup

- removed `apps/api` after Supabase cutover
- removed `apps/webhooks` after Supabase cutover
- deleted SQLite-specific scripts and migration tooling
- removed Vite proxy config
- updated root README with the new architecture

## Recommended implementation order

If you want the safest migration path, do it in this order:

1. Auth and schema
2. Connection management
3. Automation CRUD
4. Post loading
5. Webhook ingestion
6. Execution runner
7. Token refresh scheduler
8. Data import and cutover

## Risks to watch closely

- multi-tenant webhook signature verification if users bring their own Meta apps
- storing secrets in browser-readable places by accident
- losing retry/idempotency behavior when simplifying away the worker
- relying on GitHub Pages while still assuming same-origin API calls
- trying to migrate OAuth, auth, data model, and background jobs all at once
