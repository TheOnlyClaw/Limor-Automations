# Private Comment Multi-DM Gating

## Problem
Instagram blocks multiple DMs to private users after a comment-triggered DM. Our webhook currently sends all configured DM actions sequentially, so only the first DM succeeds and the rest fail.

## Goals
- Send a welcoming DM with CTA first, then deliver all configured DMs after interaction.
- Ensure private-user flow is consistent and does not partially send the sequence.
- Keep single-DM automations unchanged.
- Preserve existing reply behavior and rule matching.

## Non-goals
- No redesign of automation rules or action sequencing.
- No changes to public-user behavior unless required by Instagram API limits.
- No new external dependencies.

## Current Flow (Summary)
- Webhook receives a comment event in `supabase/functions/instagram-webhook/index.ts`.
- Matching actions are queued and sent immediately in `processExecutions`.
- DMs are sent via `sendDm` in `supabase/functions/_shared/instagramActions.ts`.

## Proposed Behavior
- If an automation has multiple DM actions:
  - Send a configurable greeting DM with a CTA (not one of the configured DMs).
  - Mark all configured DM actions as awaiting user interaction.
  - When the user interacts with the CTA, send all configured DMs in order.
- If only one DM action exists, send it normally (no CTA unless explicitly enabled).

## Interaction Mechanism
Preferred baseline: keyword reply (e.g., "Reply YES to receive the rest") because it works even if the Graph API does not support DM buttons for this context. If button/quick reply payloads are supported for comment-triggered DMs, we can upgrade the CTA to buttons without changing the gating logic.

## Data Model (Additive)
### Automation-level CTA config
- `automations.dm_cta_text text null` (button label)
- `automations.dm_cta_greeting text null` (greeting message body)
- Optional `automations.dm_cta_enabled boolean default false` (if single-DM should still gate)

### CTA sessions table (traceability)
- `automation_cta_sessions`
  - `id uuid pk`
  - `event_id uuid`
  - `automation_id uuid`
  - `comment_id text`
  - `recipient_ig_user_id text`
  - `cta_payload text`
  - `status text` (`pending` | `processing` | `completed` | `expired`)
  - `created_at timestamptz`
  - `completed_at timestamptz`

### Execution Status
Either:
- Add `awaiting_cta` to `automation_executions.status`, or
- Keep `queued` and add `blocked_reason = 'awaiting_cta'`.

## Webhook Logic Changes
1) Build ordered action list for the automation.
2) If there are 2+ DM actions (or CTA enabled):
   - Create CTA session with payload.
   - Send greeting DM with CTA button (message is `dm_cta_greeting`).
   - Mark all configured DM executions as `awaiting_cta` (not failed).
3) On CTA interaction event:
   - Validate payload and ownership.
   - Mark session as completed.
   - Send all configured DMs in order.

## UI Changes (Automation Dialog)
- Show CTA configuration when 2+ DMs exist (and optionally allow enabling for single DM).
- Fields:
  - Greeting message (required when CTA enabled)
  - CTA button text (required when CTA enabled)
- Inline helper text: "We send a greeting with a button before the DM sequence."

## Error Handling & Logging
- Mark awaiting executions as non-errors.
- Log CTA waits and completions with `commentId`, `automationId`, and `eventId` (no message content).
- If CTA interaction is invalid or expired, return `ok` but do not send more DMs.

## Edge Cases
- If CTA is enabled but no DM actions exist, skip CTA and log a warning.
- If the user interacts multiple times, dedupe by `event_id + action_id` and by session status.
- If CTA expires, remaining DMs stay blocked (no retries unless user interacts again).

## Implementation Plan
1) Schema changes
   - Add CTA config to `automations` table.
   - Update CTA session status enum to include `processing`.
2) Update webhook execution
   - Send greeting DM with CTA first.
   - Mark all DM executions as `awaiting_cta`.
   - On CTA click, send all DMs in order and mark executions as `succeeded`.
3) Update UI + API
   - Add greeting + CTA fields and validation.
   - Include new fields in automation create/update RPC payloads.
4) Backfill
   - For existing automations with multiple DMs, set default greeting and CTA text.
5) Monitor
   - Track `awaiting_cta` counts and CTA completion rate.

## Open Decision
Confirm whether Instagram Graph supports DM buttons/quick replies for comment-triggered DMs. If not, default to keyword reply CTA with the same greeting message.
