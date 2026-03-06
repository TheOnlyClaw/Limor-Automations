# 0005 — Post Automations CRUD (Regex Rules)

## Purpose
Enable an Instagram user to configure **per-post** automations that trigger on **new comments**.
When a comment matches one or more **regex** rules, the system executes one or more actions:
- **Reply** publicly to the comment
- **Send DM** to the commenter
- **Both**

This spec defines the backend data model + CRUD API only.

## Definitions
- **Automation**: configuration bound to a single Instagram post.
- **Rule**: a regex pattern applied to incoming comment text.
- **Action**: a side effect (reply, DM) with a message template.

## Data model (SQLite)
Tables:

### `post_automations`
- `id` TEXT PK (uuid)
- `token_id` TEXT FK -> `instagram_tokens.id`
- `ig_post_id` TEXT (the Instagram media id)
- `name` TEXT
- `enabled` INTEGER (0/1)
- `created_at` TEXT (ISO)
- `updated_at` TEXT (ISO)

Constraints:
- `(token_id, ig_post_id)` should be indexable; multiple automations per post are allowed.

### `post_automation_rules`
- `id` TEXT PK (uuid)
- `automation_id` TEXT FK -> `post_automations.id`
- `pattern` TEXT (regex string)
- `flags` TEXT (optional, e.g. "i" for case-insensitive)
- `created_at` TEXT

Rules must compile server-side before saving.

### `post_automation_actions`
- `id` TEXT PK (uuid)
- `automation_id` TEXT FK -> `post_automations.id`
- `type` TEXT enum: `reply` | `dm`
- `template` TEXT (message template)
- `created_at` TEXT

## Message templating
Initial minimal templating: must support these placeholders:
- `{{comment.text}}`
- `{{comment.username}}`
- `{{post.id}}`

If placeholder not present, leave as-is.

## API
Base: `/api/v1`

### Create automation
`POST /automations`

Request:
```json
{
  "tokenId": "...",
  "igPostId": "...",
  "name": "Optional label",
  "enabled": true,
  "rules": [
    {"pattern": "(?i)price", "flags": ""}
  ],
  "actions": [
    {"type": "reply", "template": "Hi {{comment.username}} — DM sent."},
    {"type": "dm", "template": "Thanks for commenting: {{comment.text}}"}
  ]
}
```

Responses:
- `201` automation object
- `400` invalid regex / missing required fields
- `404` tokenId not found

### List automations
`GET /automations?tokenId=...&igPostId=...`
- query filters optional; if none, returns all.

### Get automation
`GET /automations/:id`

### Update automation
`PATCH /automations/:id`
Allow patching:
- `name`, `enabled`
- replace `rules` array (full replace)
- replace `actions` array (full replace)

### Delete automation
`DELETE /automations/:id`

## Validation rules
- `rules`: at least 1
- `actions`: at least 1
- at least one action must be `reply` or `dm` (enum)
- `template` non-empty

## Observability
- Log creates/updates/deletes with automation id + token id (no secrets).

## Out of scope
- Webhook ingestion
- Executing actions (reply/DM)
- Scheduling / retries
