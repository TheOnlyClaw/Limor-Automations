# 0009 — Instagram Bootstrap + Webhook Signature Verification

Status: **Proposed**

## Goal
Make the system secure and self-sufficient:
1) Resolve/store needed IDs for Graph operations.
2) Verify webhook authenticity via signature.

## Bootstrap (token -> IDs)
### Stored fields on `instagram_tokens`
- `page_id` (string, nullable)
- `ig_user_id` (string, nullable) — instagram business account id

### Endpoints
- `POST /api/v1/instagram-tokens/:id/resolve-ids`
  - uses token to fetch pages and attached instagram business account
  - stores `page_id` and `ig_user_id`

## Webhook signature verification
Validate `X-Hub-Signature-256` using Meta App Secret.

- On missing/invalid signature: respond `401`.
- Config:
  - `META_APP_SECRET`

## Acceptance Criteria
- Webhook endpoint rejects invalid signatures.
- Bootstrap endpoint stores `ig_user_id` needed for posts lookup and comment actions.
