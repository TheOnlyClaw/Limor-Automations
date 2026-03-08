# Failed Executions Per Post

## Problem
Users cannot see or retry failed automation executions from the dashboard.

## Goals
- Each post card shows a red "Failed executions" button, including a count badge when failures exist.
- Clicking the button opens a dialog scoped to the post.
- The dialog lists failed executions and shows the raw Instagram error (`last_error`).
- Users can retry individual executions from the dialog.
- On successful retry, the execution disappears from the dialog.

## Non-goals
- No new automation rule logic.
- No changes to connection or webhook behavior beyond retrying.
- No batching of retries (single execution retries only).

## Data Model
Existing tables and columns:
- `automations.ig_post_id`
- `automation_executions.automation_id`
- `automation_executions.status`
- `automation_executions.last_error`
- `automation_executions.attempts`
- `automation_executions.message_text`
- `automation_executions.message_source`
- `automation_executions.updated_at`

## UX Behavior
- Post card button:
  - Red button labeled "Failed executions".
  - Optional count badge when failed executions exist.
  - Disabled or hidden when there are zero failures.
- Dialog:
  - Title: "Failed executions".
  - Subtitle shows post context (caption snippet or permalink).
  - List items show: action type, attempts, updated time, raw error text, optional message preview.
  - Retry button per item, with loading state.
  - Empty state: "No failed executions for this post."

## API Requirements
### 1) List failed executions for a post
- Edge Function: `list-post-failed-executions`
- Input: `postId`
- Auth: `requireUser` and enforce `owner_user_id`
- Behavior:
  - Resolve automation by `ig_post_id` for the current user.
  - Query `automation_executions` where `automation_id` matches and `status = 'failed'`.
- Response fields:
  - `id`, `action_type`, `attempts`, `last_error`, `updated_at`, `message_text`, `message_source`.

### 2) Retry a single failed execution
- Edge Function: `retry-automation-execution`
- Input: `executionId`
- Auth: `requireUser` and enforce `owner_user_id`
- Behavior:
  - Reuse `retry-automation-executions` logic for a single execution.
  - On success, mark `status = 'succeeded'` and update error/message fields.

## Client Integration
- Add API helpers for list and retry.
- Dashboard state:
  - `failedExecutionsByPostId`
  - `failedExecutionsLoadingByPostId`
  - `failedExecutionsErrorByPostId`
  - `failedExecutionsPostId` (dialog state)
  - `retryingExecutionIds`
- On dialog open:
  - Fetch failures if not cached or stale.
- On retry success:
  - Optimistically remove item from list.
  - Optionally refetch to reconcile.

## Error Handling
- List errors show inline in dialog.
- Retry errors show per item.
- Log server-side failures without exposing secrets.

## Security
- All Edge Functions must use `requireUser` and verify ownership.
- Do not return access tokens or connection secrets.

## Open Decision
- Mapping from post to executions:
  - Recommended: `automations.ig_post_id` -> `automation_executions.automation_id` (assumes one automation per post).
  - Alternative: derive via `instagram_webhook_events` if multiple automations per post are expected.
