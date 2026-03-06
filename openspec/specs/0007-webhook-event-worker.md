# 0007 — Webhook Event Worker (Processor)

Status: **Proposed**

## Goal
Process Instagram webhook events asynchronously and reliably:
- handle retries/backoff
- avoid double-processing
- provide observability

Webhook HTTP handlers should **only ingest and enqueue**.

## Non-Goals
- Actually executing Instagram actions (reply/DM) — see **0008**.

## Data Model
### `instagram_webhook_events` (extends 0006)
Add/ensure these fields exist:
- `id` (pk)
- `dedupe_key` (unique)
- `payload_json` (string)
- `received_at` (datetime)
- `status` enum: `pending | processing | processed | failed`
- `attempts` int default 0
- `last_error` text nullable
- `next_attempt_at` datetime nullable
- `locked_at` datetime nullable
- `locked_by` text nullable

Indexes:
- `(status, next_attempt_at)`
- `(locked_at)`

## Worker Contract
### CLI
- `npm run worker:events`
  - continuously polls the DB for due events
  - claims a batch
  - processes them

### Claiming algorithm
Pseudo:
1. select events where:
   - `status in (pending, failed)`
   - `next_attempt_at is null OR next_attempt_at <= now`
   - `locked_at is null OR locked_at < now - lock_ttl`
2. mark claimed rows:
   - `status = processing`
   - `locked_at = now`
   - `locked_by = <worker-id>`
3. return claimed events

Lock TTL: default 5 minutes (configurable).

### Processing result
- On success:
  - `status=processed`, clear lock
- On retryable failure:
  - increment `attempts`
  - `status=failed`
  - set `next_attempt_at` using exponential backoff
- On permanent failure (e.g. schema invalid):
  - `status=failed`, `next_attempt_at=NULL`

Backoff (example):
- `min = 30s`, `max = 6h`
- `delay = min(max, min * 2^attempts)`

## Observability
- Structured logs include `event_id`, `dedupe_key`, `attempts`, `status`.

## Acceptance Criteria
- Multiple worker processes can run without double-processing.
- Retries happen with backoff.
- Crashing mid-processing does not lose events (lock expires).
