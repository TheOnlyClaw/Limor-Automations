# 0008 — Execute Automations (Match + Reply/DM)

Status: **Proposed**

## Goal
Given an ingested Instagram comment webhook event:
- identify applicable **post automation(s)**
- evaluate regex rules
- execute action(s):
  - reply comment
  - send DM
  - or both

## Non-Goals
- UI configuration (frontend)
- webhook ingestion (0006)

## Inputs
- `instagram_webhook_events.payload_json`

## Data Model
### `automation_executions`
Track idempotency and audit.
Fields:
- `id` (pk)
- `event_id` (fk to instagram_webhook_events)
- `automation_id` (fk to post_automations)
- `action_type` enum: `reply | dm`
- `status` enum: `success | failed | skipped`
- `attempts` int default 0
- `last_error` text nullable
- `created_at`

Uniqueness:
- unique `(event_id, automation_id, action_type)`

## Matching
- Automations are **per post** (ig media id).
- Each automation has 0..N regex rules.
- Rule evaluation:
  - if no rules: match all
  - else: match if any rule matches `comment.text`

Regex format:
- store `pattern` and optional JS `flags` (e.g. `i`, `m`).

Safety:
- Limit pattern length.
- Limit comment text length used for matching.

## Execution
### Reply action
- Uses Instagram Graph endpoint for replying/commenting.
- Requires correct permissions.

### DM action
- Uses Instagram Messaging via Graph.
- Must handle “cannot message user” failures gracefully.

## Templates
Action templates may include:
- `{{comment}}`
- `{{username}}` (if available)
- `{{postId}}`

## Acceptance Criteria
- A single webhook delivery cannot cause duplicate replies/DMs.
- Failed actions are recorded and retryable.
- Regex rules are validated before being stored.
