# Dashboard Slice Plan

This document captured the Slice B plan that was executed during the migration.

Status:

- completed during the Supabase cutover on 2026-03-07
- retained as a historical plan for reference

Goal:

- make the dashboard work entirely on the Supabase path
- remove the browser's remaining dependency on Fastify for posts and automation CRUD
- preserve the current dashboard UX while swapping the data path underneath it

## Preconditions

Before starting this slice:

- manually validate create, resolve, refresh, and delete against a real signed-in user
- redeploy the latest `refresh-instagram-connection` hardening patch if Supabase deploy is healthy again, or explicitly record that the hosted project is temporarily behind the repo
- use `docs/supabase-migration/12-connection-validation-checklist.md` as the concrete runbook for that checkpoint

Why this gate exists:

- Slice B depends on connection ownership, auth context, and Edge Function behavior already working reliably
- finishing the connection follow-up first reduces confusion when debugging dashboard issues later

## Current repo baseline

Already migrated:

- auth and session bootstrap in `apps/web/src/auth/`
- connection management in `apps/web/src/connections/`
- connection Edge Functions in `supabase/functions/`

Still on the old path:

- `apps/web/src/dashboard/automationsApi.ts` still calls `/api/v1/automations`
- `apps/web/src/dashboard/instagramPostsApi.ts` still calls `/api/v1/instagram/posts`
- `apps/web/src/dashboard/DashboardPage.tsx` still imports token-based settings APIs and uses token terminology in state and copy

## Decisions for this slice

### 1. Use `connectionId` end to end on the new dashboard path

- stop passing `tokenId` through new browser wrappers
- keep temporary mapper types if needed so `AutomationDialog` and draft logic stay stable during the refactor
- update user-facing copy from token to connection in files touched by this slice

### 2. Read automations directly under RLS

Recommended read query shape:

- read from `public.automations`
- join `automation_rules` and `automation_actions` with one nested select
- filter by `connection_id` and optionally `ig_post_id`
- keep ordering deterministic so the current first-rule and first-action assumptions remain stable

Why:

- reads are safe, user-owned data
- RLS already scopes automations to the signed-in user
- one round-trip keeps the current dashboard behavior simple

### 3. Write automations through RPC, not multiple browser table calls

Reason:

- create and update both need replace-all behavior for rules and actions
- direct browser inserts and deletes would be multiple HTTP calls with no transaction boundary
- partial saves would leave inconsistent automation bundles

Recommended database functions:

- `public.create_automation_bundle(connection_id uuid, ig_post_id text, name text, enabled boolean, rules jsonb, actions jsonb)`
- `public.update_automation_bundle(automation_id uuid, name text, enabled boolean, rules jsonb, actions jsonb)`

Function responsibilities:

- verify the caller owns the target connection or automation via `auth.uid()`
- insert or update the parent automation row
- delete and recreate child `automation_rules` and `automation_actions` rows inside the same transaction
- return the automation id so the client can re-fetch the canonical nested row

Delete path:

- direct `delete()` on `automations` is acceptable because the child tables already cascade
- if you want one consistent write path, add `public.delete_automation_bundle(automation_id uuid)` later, but it is not required for Slice B

Validation rule:

- keep the current browser-side regex compilation check for immediate UX feedback
- keep server-side ownership and shape validation in RPC
- do not rely on multi-step client writes for correctness

### 4. Fetch posts through an Edge Function first

Recommended function:

- `supabase/functions/list-instagram-posts/index.ts`

Behavior:

- require auth
- accept `{ connectionId, limit }`
- validate ownership of the connection
- load the encrypted token server-side
- call the Instagram Graph API
- normalize the response to the current `{ items: InstagramPost[] }` shape
- upsert returned rows into `public.instagram_posts`
- update `instagram_connections.last_posts_sync_at`

Why this path first:

- it removes the browser dependency on raw token records immediately
- it keeps all Graph API access and secret handling server-side
- it gives the repo one stable sync entrypoint even if the UI later switches to cached direct table reads

## Repo changes for Slice B

### Database and hosted project

Add a new Supabase migration that:

- creates the automation RPC functions
- grants execute permissions to authenticated users
- keeps ownership checks inside the functions

Optional follow-up, not required for the first pass:

- add indexes if dashboard queries show hot spots on `automations(connection_id, ig_post_id)` or the child tables beyond the indexes already present

### Frontend wrappers

Add:

- `apps/web/src/automations/automationsApi.ts`
- `apps/web/src/automations/mappers.ts`
- `apps/web/src/posts/postsApi.ts`

Wrapper responsibilities:

- map Supabase rows into the existing `PostAutomation` and `InstagramPost` frontend shapes
- hide snake_case column names from UI components
- implement the refetch-after-save pattern for RPC writes so the UI always receives the canonical nested automation row

Recommended `automationsApi` surface:

- `listPostAutomations({ connectionId, igPostId? })`
- `createPostAutomation({ connectionId, igPostId, name?, enabled?, rules?, actions? })`
- `patchPostAutomation(id, { name?, enabled?, rules?, actions? })`
- optional `deletePostAutomation(id)` if the dashboard later adds explicit delete UX

Recommended `postsApi` surface:

- `listInstagramPosts({ connectionId, limit? })`

### Dashboard component updates

Change:

- `apps/web/src/dashboard/DashboardPage.tsx`
- `apps/web/src/dashboard/automationDraft.ts`

Dashboard refactor goals:

- switch imports from `listInstagramTokens` to `listInstagramConnections`
- rename local state from token-oriented names to connection-oriented names
- keep `AutomationDialog` behavior intact
- keep the current draft state machine and save validation logic intact
- update empty states and button copy to talk about connections instead of tokens

Expected outcome:

- the visual dashboard stays familiar
- the underlying data path is now Supabase-only

## Suggested implementation order

0. Finish the remaining connection validation and hosted deploy follow-up from `docs/supabase-migration/10-implementation-status.md`.
1. Add the automation RPC migration and push it to the hosted project.
2. Build the new `apps/web/src/automations/` wrapper with nested selects plus refetch-after-save.
3. Implement `supabase/functions/list-instagram-posts` and deploy it.
4. Add `apps/web/src/posts/postsApi.ts` for invoking the function.
5. Refactor `apps/web/src/dashboard/DashboardPage.tsx` to use connections, posts, and automation wrappers.
6. Remove the dashboard's remaining Fastify assumptions from the browser path.

## Validation checklist for this slice

- `npm -w apps/web run lint`
- `npm -w apps/web exec tsc -b`
- manual browser check: dashboard loads after sign-in without a local Fastify API
- manual browser check: selecting a connection loads posts successfully
- manual browser check: create and update automation changes survive reload
- manual browser check: no browser response exposes raw access tokens

## Exit criteria

- dashboard no longer imports `apps/web/src/settings/instagramTokensApi.ts`
- no dashboard browser call hits `/api/v1/automations`
- no dashboard browser call hits `/api/v1/instagram/posts`
- the web app can run its core authenticated flows without the local Fastify API
- Fastify remains only as a reference for the later webhook/runtime migration slice
