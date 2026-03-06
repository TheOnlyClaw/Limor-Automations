# 0006 — Instagram Webhooks (Comments Ingestion)

## Purpose
Receive Instagram Graph API webhook events for **comments** on media.
Store events durably for later processing (worker) and dedupe repeated deliveries.

## Assumptions
- We are using Instagram Graph API webhooks (via Facebook App).
- Verification uses `hub.*` query parameters.

## API
Base: `/api/v1`

### Verification
`GET /webhooks/instagram`

Query params:
- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Behavior:
- If `hub.verify_token` matches `IG_WEBHOOK_VERIFY_TOKEN`, respond `200` with plain body = `hub.challenge`
- Else respond `403`

### Ingest
`POST /webhooks/instagram`

Behavior:
- Respond quickly (`200`) after persisting event.
- Persist raw payload JSON.
- Compute a dedupe key for the delivery; if already stored, ignore.

## Storage (SQLite)
Table: `instagram_webhook_events`
- `id` TEXT PK (uuid)
- `dedupe_key` TEXT UNIQUE
- `received_at` TEXT (ISO)
- `payload_json` TEXT (raw JSON)
- `status` TEXT enum: `pending` | `processing` | `done` | `failed`
- `attempts` INTEGER
- `last_error` TEXT

Dedupe key strategy (deterministic):
- Prefer `entry[].id + changes[].field + changes[].value.id` when present
- Fall back to hash of raw body

## Security
- Do not log full payloads at info level.
- (Optional later) Validate `X-Hub-Signature-256`.

## Out of scope
- Processing events into actions
- Rate limiting / retries
- Instagram permissions/app configuration
