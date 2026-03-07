# Automation Comment Filtering

## Problem
Automation replies can trigger the webhook again when the reply text matches automation rules, creating recursion.

## Goals
- Process only top-level comments (parent comments).
- Ignore replies to comments (payload has `parent_id`).
- Ignore comments authored by the connected Instagram account (when `from.id` matches `self_ig_scoped_id`).
- Apply the same filters during both webhook processing and retry execution.

## Non-goals
- No changes to rule matching logic or action templates.
- No schema or migration changes.
- No additional Graph API calls.

## Inputs And Signals
- `value.parent_id`: present only for replies.
- `value.from.id`: scoped Instagram user ID of the commenter.
- `value.self_ig_scoped_id`: scoped Instagram user ID of the account owner.

## Behavior
- Webhook processing:
  - After signature validation and comment parsing, ignore events that are replies or self-comments.
  - Return `{ ok: true }` without storing webhook events or creating automation executions.
- Retry execution:
  - If a stored event is a reply or self-comment, mark the execution as `skipped` with an ignore reason.
  - Do not attempt to send replies or DMs for skipped executions.

## Logging And Visibility
- Log ignore reason with `commentId` and `igPostId` (no comment text).
- Store ignore reason in `automation_executions.last_error` for skipped retries.

## Edge Cases
- If `self_ig_scoped_id` or `from.id` is missing, the self-check is skipped.
- If `parent_id` is missing, treat the comment as top-level.
