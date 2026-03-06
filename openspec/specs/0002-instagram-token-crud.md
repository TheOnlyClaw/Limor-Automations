# 0002 — Instagram Token CRUD (Graph API)

## Goal
Provide a minimal CRUD interface for storing Instagram Graph API access tokens.

This enables later features (posts retrieval, scheduled token extension) to operate on stored tokens.

## Scope
- SQLite table to store tokens
- Fastify REST API CRUD
- Basic validation

## Non-Goals (for now)
- User authentication / multi-tenant ownership
- Encrypt-at-rest (we may add later)
- Token verification with Instagram/Facebook at create time

## Data Model
Table: `instagram_tokens`

Columns:
- `id` (TEXT, primary key) — generated UUID
- `label` (TEXT, nullable) — human friendly name
- `access_token` (TEXT, required)
- `created_at` (TEXT, ISO8601)
- `updated_at` (TEXT, ISO8601)

Future columns (planned):
- `ig_user_id` (TEXT)
- `expires_at` (TEXT)
- `last_refreshed_at` (TEXT)

## API
Base prefix: `/api/v1`

### Create token
`POST /instagram-tokens`

Body:
```json
{
  "label": "Limor",
  "accessToken": "EAAB..."
}
```

Responses:
- `201` token
- `400` validation error

### List tokens
`GET /instagram-tokens`

Response: `200` list

### Get token
`GET /instagram-tokens/:id`

- `200` token
- `404` not found

### Update token
`PATCH /instagram-tokens/:id`

Body (partial):
```json
{
  "label": "New label",
  "accessToken": "EAAB..."
}
```

- `200` updated token
- `404` not found

### Delete token
`DELETE /instagram-tokens/:id`

- `204` success
- `404` not found

## Validation Rules
- `accessToken` required on create; must be a non-empty string
- `label` optional; if provided must be non-empty and max length (implementation-defined)

## Security Notes
- Access tokens are secrets.
- For minimalism we store plaintext in SQLite initially.
- Follow-up: add encryption-at-rest using an app-level key.

## Acceptance Criteria
- CRUD endpoints exist and are covered by a migration.
- Tokens can be created, listed, retrieved, updated, deleted.
