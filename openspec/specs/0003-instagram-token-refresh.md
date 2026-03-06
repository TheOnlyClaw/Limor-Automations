# 0003 — Instagram Token Extension / Refresh (Graph API)

## Goal
Keep Instagram Graph API access tokens usable over time by periodically extending (refreshing) them.

In Graph API terms this is typically extending/renewing long-lived access tokens (not classic OAuth refresh tokens).

## Scope
- Add fields to track refresh lifecycle
- Manual refresh endpoint
- Batch refresh CLI job
- Optional in-process scheduler

## Non-Goals (for now)
- Full OAuth login flow
- Multi-tenant auth/authorization
- Guarantees across multiple app instances (single-instance assumption)

## Data Model Changes
Table: `instagram_tokens`

Add columns:
- `token_type` (TEXT, default `graph`) — reserved for future
- `expires_at` (TEXT, nullable, ISO8601)
- `last_refreshed_at` (TEXT, nullable, ISO8601)
- `refresh_status` (TEXT, nullable) — `ok` | `error` | `pending`
- `refresh_error` (TEXT, nullable)

## API
Base prefix: `/api/v1`

### Manual refresh
`POST /instagram-tokens/:id/refresh`

Behavior:
- Reads current `access_token`
- Calls Graph API endpoint to extend token (implementation uses configured Graph API version)
- Updates stored `access_token` if rotated
- Updates `expires_at`, `last_refreshed_at`, `refresh_status`, `refresh_error`

Responses:
- `200` refreshed token summary
- `404` token not found
- `502` upstream error

## Background Job
Command:
- `npm run tokens:refresh-due`

Behavior:
- Finds tokens where `expires_at` is within a configurable window (e.g. next 7 days) OR `expires_at` is NULL
- Attempts refresh
- Records status per token

Config (env):
- `GRAPH_API_VERSION` (e.g. `v23.0`)
- `TOKENS_REFRESH_WINDOW_DAYS` (default 7)
- `ENABLE_SCHEDULER` (0/1)
- `SCHED_CRON` (cron string; default e.g. `0 */6 * * *`)

## Scheduler
If `ENABLE_SCHEDULER=1`, run the refresh-due job on schedule inside the Fastify process.

## Acceptance Criteria
- Migration adds refresh tracking fields.
- Manual refresh endpoint exists.
- CLI job exists and can be run independently.
- Refresh attempts update `refresh_status` and store any error.
