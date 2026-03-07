# Limor Automations

Monorepo.

- **API:** Fastify + TypeScript (`apps/api`)
- **Web:** React (Vite) + Tailwind CSS (`apps/web`)
- **Specs:** OpenSpec (`openspec/`)

## Dev

Install:

```bash
npm install
```

Run both:

```bash
npm run dev
```

Run API only:

```bash
npm run dev:api
```

Run web only:

```bash
npm run dev:web
```

## Supabase Migration Bootstrap

The initial Supabase scaffold lives in `supabase/` and targets hosted Supabase.

- repo config: `supabase/config.toml`
- initial schema: `supabase/migrations/20260307130000_initial_app_schema.sql`
- hosted workflow: `supabase/README.md`

Hosted Supabase commands:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy <function-name>
```
