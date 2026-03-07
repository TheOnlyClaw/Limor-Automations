# Frontend And SDK Plan

## Frontend goals

- add auth without rewriting the app shell
- remove dependence on same-origin `/api` routes
- keep UI logic mostly intact
- stop exposing secrets in the browser

## Auth plan

Add Supabase Auth first.

Recommended initial auth modes:

- email and password
- Google, if you want faster onboarding later

Frontend changes:

- create a shared Supabase browser client
- gate the app on session presence
- add sign-in, sign-up, sign-out, and session bootstrap states
- create a `profiles` row on first login

Minimal route structure after auth:

- `/login`
- `/dashboard`
- `/settings`

## Current frontend API layer

Today the app uses a tiny fetch wrapper plus hand-written API modules.

Current wrappers:

- `apps/web/src/lib/api.ts`
- `apps/web/src/settings/instagramTokensApi.ts`
- `apps/web/src/dashboard/automationsApi.ts`
- `apps/web/src/dashboard/instagramPostsApi.ts`

## Recommended frontend data layer after migration

Split it into two clients.

### 1. Supabase table client

Use for:

- automations
- rules
- actions
- cached posts
- profile reads
- execution history

### 2. Edge Function client

Use for:

- create/import connection
- refresh token
- resolve IG ids
- fetch/sync posts from Graph API
- any future Meta OAuth flows

## SDK recommendation

Use:

- `@supabase/supabase-js`
- generated `database.types.ts` from your Supabase schema

Suggested wrappers to add:

- `src/lib/supabase.ts`
- `src/lib/auth.ts`
- `src/lib/functions.ts`
- `src/features/connections/api.ts`
- `src/features/automations/api.ts`

The goal is to keep the UI components mostly unaware of whether data comes from direct table queries or a function invoke.

## How each current frontend area should change

### Settings page

Current behavior:

- lists tokens
- creates tokens
- reveals/copies raw access tokens
- refreshes tokens
- resolves ids

New behavior:

- lists user-owned Instagram connections
- creates/imports a connection through an Edge Function
- never reveals the stored raw token again
- still supports refresh and resolve actions through function invokes

UI change recommendation:

- replace the reveal/copy token actions with connection health, expiry, and re-auth actions

### Dashboard page

Current behavior:

- load connections
- select one token
- fetch posts
- read and write automations

New behavior:

- load authenticated user's connections
- select one connection
- fetch cached posts directly or invoke a post-sync function
- read/write automations under RLS

The component structure can stay close to the current one.

## Execution history UI

The current frontend does not appear to consume execution history.

Migration opportunity:

- add a per-automation activity panel backed by `automation_executions`
- this becomes much easier once rows are user-scoped and queryable under RLS

## Hosting details

### Vercel

Recommended build/runtime model:

- deploy `apps/web` as a static Vite app
- configure `VITE_SUPABASE_URL`
- configure `VITE_SUPABASE_PUBLISHABLE_KEY` for new setups, with `VITE_SUPABASE_ANON_KEY` retained only as a legacy fallback
- configure auth redirect URLs for preview and production domains

### GitHub Pages

If you choose GitHub Pages:

- build as a static SPA
- ensure deep-link fallback works for `/dashboard` and `/settings`
- configure Supabase redirect URLs for the Pages domain
- avoid assumptions about same-origin API routes

Because the browser will call Supabase directly, static hosting is fine.

## Frontend migration sequence

### Step 1

- add Supabase client and auth shell
- do not remove existing pages yet

### Step 2

- migrate connection listing and automation CRUD to Supabase-backed calls

### Step 3

- replace `/api` assumptions in all browser calls
- remove Vite dev proxy dependence

### Step 4

- remove token reveal/copy flows
- add auth-aware onboarding and empty states

### Step 5

- optionally add a real `Connect Instagram` flow

## Important frontend security rule

After the migration, the browser should know:

- who the user is
- which connections they own
- whether a token exists and when it expires

The browser should not know:

- the raw Meta app secret
- the raw webhook verify token
- the stored long-lived Instagram access token
