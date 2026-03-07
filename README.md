# Limor Automations

Monorepo.

- **Supabase:** Hosted Postgres + Edge Functions (`supabase/`)
- **Web:** React (Vite) + Tailwind CSS (`apps/web`)

## Dev

Install:

```bash
npm install
```

Run web:

```bash
npm run dev
```

## Supabase (Primary runtime)

The Supabase migration is complete. Hosted Supabase is the primary backend, and ongoing schema/function changes live in `supabase/`. Legacy Fastify/webhook services have been removed from the repo.

- repo config: `supabase/config.toml`
- initial schema: `supabase/migrations/20260307130000_initial_app_schema.sql`
- hosted workflow: `supabase/README.md`

Hosted Supabase commands:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy <function-name>
```
