# Supabase Migration Guide

This folder documents a full migration path from the current self-hosted Fastify + SQLite stack to a Supabase-backed, multi-user version with auth.

Files:

- `docs/supabase-migration/01-current-state-audit.md` - how the repo works today
- `docs/supabase-migration/02-target-architecture.md` - recommended Supabase architecture
- `docs/supabase-migration/03-schema-and-rls-plan.md` - database, ownership, secrets, and RLS design
- `docs/supabase-migration/04-backend-and-functions-plan.md` - API, workers, webhooks, and cron migration
- `docs/supabase-migration/05-frontend-and-sdk-plan.md` - auth, hosting, frontend, and SDK changes
- `docs/supabase-migration/06-rollout-checklist.md` - phased rollout and cutover checklist
- `docs/supabase-migration/07-supabase-schema.sql` - implementation-ready schema draft that informed the hosted migrations
- `docs/supabase-migration/08-edge-functions-spec.md` - Edge Function responsibilities and contracts
- `docs/supabase-migration/09-repo-execution-backlog.md` - concrete implementation order in this repo
- `docs/supabase-migration/10-implementation-status.md` - what has already been implemented
- `docs/supabase-migration/11-dashboard-slice-plan.md` - detailed plan for the next dashboard migration slice
- `docs/supabase-migration/12-connection-validation-checklist.md` - exact pre-Slice-B validation and hosted drift notes

Recommended direction:

1. Move persistence from SQLite to Supabase Postgres.
2. Add Supabase Auth and make every row user-scoped.
3. Replace the always-on Fastify worker loops with immediate webhook-time execution plus small scheduled recovery jobs.
4. Keep browser access direct only for safe, user-owned data; keep token refresh, webhook handling, and Meta API calls server-side.
5. Prefer Vercel for the frontend; use GitHub Pages only if you want a fully static deployment and are comfortable managing SPA routing and auth redirect details yourself.

Runtime recommendation:

- when a comment webhook arrives, try to evaluate rules and execute the reply/DM immediately inside the webhook Edge Function
- still persist the webhook event and execution rows first for idempotency, observability, and retry safety
- keep scheduled jobs only for retries, deferred work, and token refresh

Important product decision:

- If users should bring their own Meta app credentials, the webhook design must be tenant-aware from day one. A single global `META_APP_SECRET` no longer works.
- If you are fine with one shared Meta app owned by you, the migration is much simpler and still supports per-user Instagram accounts and automations.

The rest of this guide assumes the harder but more flexible target: authenticated multi-user SaaS with per-user ownership, and a design that can support either shared-app mode or bring-your-own-app mode.
