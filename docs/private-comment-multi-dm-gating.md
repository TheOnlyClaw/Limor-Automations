# Private Comment Multi-DM Gating

## Problem
Instagram blocks multiple DMs to private users after a comment-triggered DM. Our webhook currently sends all configured DM actions sequentially, so only the first DM succeeds and the rest fail.

## Goals
- When more than one DM is configured, send a first DM that includes a user interaction prompt.
- Only send remaining DMs after the user interacts with the prompt.
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
  - Send the first DM with a configurable interaction prompt (CTA).
  - Mark remaining DM actions as awaiting user interaction.
  - When the user interacts with the CTA, send the remaining DMs in order.
- If only one DM action exists, send it normally (no CTA).

## Interaction Mechanism
Preferred baseline: keyword reply (e.g., "Reply YES to receive the rest") because it works even if the Graph API does not support DM buttons for this context. If button/quick reply payloads are supported for comment-triggered DMs, we can upgrade the CTA to buttons without changing the gating logic.

## Data Model (Additive)
### Option A: Extend automation_actions
- `requires_user_action boolean not null default false`
- `cta_text text null`
- `cta_payload text null`

### Option B: CTA sessions table (recommended for traceability)
- `automation_cta_sessions`
  - `id uuid pk`
  - `event_id uuid`
  - `automation_id uuid`
  - `comment_id text`
  - `recipient_ig_user_id text`
  - `cta_payload text`
  - `status text` (`pending` | `completed` | `expired`)
  - `created_at timestamptz`
  - `completed_at timestamptz`

### Execution Status
Either:
- Add `awaiting_cta` to `automation_executions.status`, or
- Keep `queued` and add `blocked_reason = 'awaiting_cta'`.

## Webhook Logic Changes
1) Build ordered action list for the automation.
2) If there are 2+ DM actions:
   - Mark the first DM with `requires_user_action` and attach CTA text/payload.
   - Insert executions for all actions.
   - Send only the first DM immediately.
   - Mark remaining DM executions as `awaiting_cta` (not failed).
3) On CTA interaction event:
   - Validate payload and ownership.
   - Mark the session as completed.
   - Transition remaining DM executions to `queued` and send in order.

## UI Changes (Automation Dialog)
- Show CTA configuration only when 2+ DM actions exist.
- Fields:
  - CTA text (required when multiple DMs)
  - Optional post-interaction acknowledgement (future use)
- Inline helper text: "Private accounts require a tap/reply to receive more than one DM."

## Error Handling & Logging
- Mark awaiting executions as non-errors.
- Log CTA waits and completions with `commentId`, `automationId`, and `eventId` (no message content).
- If CTA interaction is invalid or expired, return `ok` but do not send more DMs.

## Edge Cases
- If CTA is configured but only one DM remains, send it immediately after interaction.
- If the user interacts multiple times, dedupe by `event_id + action_id` (already enforced).
- If CTA expires, remaining DMs stay blocked (no retries unless user interacts again).

## Rollout Plan
1) Add schema changes and defaults for existing automations.
2) Update webhook logic to gate multi-DM for private users.
3) Add CTA configuration UI and validation.
4) Monitor execution statuses and failure logs for regressions.

## Open Decision
Confirm whether Instagram Graph supports DM buttons/quick replies for comment-triggered DMs. If not, default to keyword reply CTA.
