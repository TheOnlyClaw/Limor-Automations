# Target Architecture

## Recommended target

Use Supabase as the backend control plane and keep the frontend separately hosted.

Recommended split:

- Supabase Postgres for persistence
- Supabase Auth for user identity
- Row Level Security for ownership boundaries
- Supabase Edge Functions for all secret-bearing and webhook code
- Vercel for the React frontend

## Why this shape fits the app

- The product is CRUD-heavy with a small number of background workflows.
- The current worker already models work as database rows, which maps well to Postgres.
- The frontend can become a static app once API responsibilities move behind Supabase.
- Auth and per-user ownership are first-class in Supabase, which you need for a multi-user version.

## Recommended high-level architecture

### Browser

Responsibilities:

- sign in and sign out with Supabase Auth
- read safe user-owned records under RLS
- create and edit automations
- invoke Edge Functions for actions that require secrets or third-party calls

The browser should not receive or store raw Meta app secrets.

### Supabase Postgres

Responsibilities:

- system of record for users, Instagram connections, automations, events, and execution logs
- row ownership enforcement through RLS
- idempotency, uniqueness, and retry scheduling state

### Supabase Edge Functions

Responsibilities:

- webhook verification and ingestion
- Graph API token refresh
- IG account bootstrap/resolve-ids
- server-side post sync or post fetch proxy
- scheduled event processing
- DM/reply execution

### Optional storage/cache layer

If you want to reduce repeated Graph API fetches:

- cache synced posts in a table keyed by connection id and post id
- keep a `last_synced_at` column on the connection

That is better than the current in-memory cache because it survives cold starts.

## Shared Meta app vs bring-your-own app

This is the biggest product architecture choice.

### Option A: shared Meta app for all users

Pros:

- much simpler OAuth setup
- one webhook app configuration
- one app secret to manage server-side
- easier support and troubleshooting

Cons:

- all users depend on your app approval and rate limits
- less flexible for agencies/power users

### Option B: each user configures their own Meta app credentials

Pros:

- true bring-your-own-keys model
- users control their own app setup and limits
- better fit if this becomes a platform

Cons:

- webhook verification becomes tenant-aware
- onboarding is much more complex
- app review, callback URLs, and troubleshooting move to each user

### Recommendation

Start with Option A unless bring-your-own app credentials are a hard requirement.

If you want to preserve the possibility of Option B later, design the schema now so that:

- every Instagram connection belongs to a user
- Meta app credentials live in a separate table from the connection
- webhook functions can resolve which secret to use from the URL path or connection id

## Webhook architecture in Supabase

### Shared-app mode

- one public Edge Function endpoint handles the webhook
- function verifies the signature with one server secret
- function inserts event rows into `instagram_webhook_events`

### Bring-your-own-app mode

Use a tenant-aware endpoint such as:

- `/functions/v1/instagram-webhook/{connection_id}` or
- `/functions/v1/instagram-webhook/{meta_app_id}`

Flow:

1. The path identifies the tenant/app.
2. The function loads the correct secret from private storage.
3. The function verifies the signature.
4. The function inserts the event with the correct ownership.

Without that lookup step, a single endpoint cannot safely validate signatures for multiple app secrets.

## Background processing architecture

Do not default to a polling worker. Prefer immediate execution in the webhook function, with scheduled recovery only for failures or deferred items.

Recommended jobs:

- `refresh-instagram-tokens` - runs on a schedule and refreshes due tokens
- `retry-automation-executions` - retries failed or deferred executions
- optional `sync-instagram-posts` - refreshes cached post metadata

Primary runtime flow:

1. Webhook Edge Function receives the comment.
2. It verifies the signature and persists the event.
3. It loads matching automations immediately.
4. It writes execution rows and attempts reply/DM delivery in the same request.
5. If delivery fails or must be deferred, retry state remains in Postgres for a scheduled recovery function.

This removes dependence on a long-lived server process without losing reliability.

## Hosting recommendation

### Vercel

Recommended for the frontend because:

- easy SPA hosting
- easy env var management
- good preview deployments
- simple custom domain setup

### GitHub Pages

Possible only for the frontend, but less convenient because:

- SPA routing needs explicit fallback handling
- auth redirect URLs need more care
- env var handling is static at build time only

GitHub Pages does not replace Edge Functions. It only hosts the static app.
