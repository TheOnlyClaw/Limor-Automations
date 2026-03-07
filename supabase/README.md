# Supabase Hosted Workflow

This repo now includes the initial Supabase scaffold for the migration plan.

## Prerequisites

- Supabase CLI available through `npx supabase`
- access to the hosted Supabase project

## Remote project workflow

Link this repo to the hosted Supabase project:

```bash
npx supabase link --project-ref <project-ref>
```

Create a new migration file:

```bash
npx supabase migration new <name>
```

Push repo migrations to the hosted project:

```bash
npx supabase db push
```

Generate TypeScript types from the linked project:

```bash
npx supabase gen types typescript --linked --schema public > apps/web/src/lib/supabaseDatabase.ts
```

Deploy an Edge Function:

```bash
npx supabase functions deploy <function-name>
```

Set hosted project secrets:

```bash
npx supabase secrets set --env-file .env
```

Connection-management functions expect these secrets:

- `TOKEN_ENCRYPTION_KEY`
- `TOKEN_ENCRYPTION_SALT`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_ORIGIN`

## Notes

- `supabase/config.toml` is kept minimal because this repo targets hosted Supabase, not the local Docker stack.
- do not commit service-role keys, anon keys, or local `.env` files.
- if you use Supabase branches later, avoid committing branch-specific linked project refs.

## Current scope

- repo Supabase config lives in `supabase/config.toml`
- initial schema lives in `supabase/migrations/20260307101358_initial_app_schema.sql`
- hardening follow-up lives in `supabase/migrations/20260307101915_schema_hardening.sql`
- automation RPC migrations live in `supabase/migrations/20260307114851_automation_bundle_rpc.sql` and `supabase/migrations/20260307115535_automation_bundle_rpc_permissions.sql`
- profile bootstrap happens with a trigger on `auth.users`
- secret-bearing writes are expected to run through Edge Functions or the service role
- secret-bearing tables and columns stay off the browser path by default
- current hosted connection functions: `create-instagram-connection`, `update-instagram-connection`, `delete-instagram-connection`, `resolve-instagram-connection`, `refresh-instagram-connection`
