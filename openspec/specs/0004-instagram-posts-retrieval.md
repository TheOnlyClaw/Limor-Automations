# 0004 — Instagram Posts Retrieval (Latest 30) — Graph API

## Goal
Provide a GET endpoint to retrieve the latest 30 Instagram posts for a user.

## Scope
- Store `ig_user_id` associated with a stored token
- Endpoint to fetch latest media from Instagram Graph API

## Non-Goals (for now)
- Persisting posts in the database (live fetch only)
- Paging beyond the latest N
- Insights/metrics

## Data Model Changes
Table: `instagram_tokens`

Add column:
- `ig_user_id` (TEXT, nullable)

## API
Base prefix: `/api/v1`

### Get latest posts
`GET /instagram/posts`

Query params:
- `tokenId` (required)
- `limit` (optional, default 30, max 30)

Behavior:
- Loads token by `tokenId`
- Requires `ig_user_id` to be set for that token (otherwise 400)
- Calls:
  `GET https://graph.facebook.com/{GRAPH_API_VERSION}/{ig_user_id}/media`
  with fields:
  - `id,caption,media_type,media_url,permalink,timestamp,thumbnail_url`

Response: `200`
```json
{
  "data": [
    {
      "id": "...",
      "caption": "...",
      "mediaType": "IMAGE",
      "mediaUrl": "https://...",
      "permalink": "https://...",
      "timestamp": "2026-03-06T00:00:00+0000",
      "thumbnailUrl": null
    }
  ]
}
```

Errors:
- `400` missing tokenId / ig_user_id
- `404` token not found
- `502` upstream Graph API error

## Acceptance Criteria
- Endpoint returns up to 30 latest posts for the configured IG user.
- Uses Graph API version env var.
- Minimal, consistent response shape.
