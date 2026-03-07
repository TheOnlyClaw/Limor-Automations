# Connection Validation Checklist

This checklist was used before starting the dashboard migration slice.

Status: completed as of 2026-03-07. Checklist executed; hosted connection functions aligned with the repo.

Goal (completed):

- verify the Supabase connection flows work end to end for a real signed-in user
- record the remaining hosted-vs-repo delta for `refresh-instagram-connection`
- remove ambiguity about what must be checked before Slice B starts

## Preconditions

- use the hosted Supabase project `dpfbbodkvgtojrffmcaf`
- sign in through the real web UI, not only through local API calls
- test with a real long-lived Instagram token that can be safely rotated or deleted
- have access to the Supabase dashboard or SQL editor for spot-checking rows

## Manual browser validation

Primary screen:

- `apps/web/src/settings/sections/InstagramConnectionsSection.tsx`

### 1. Create connection

Steps:

1. Sign in and open Settings.
2. In `Add connection`, submit a label and valid access token.
3. Confirm the new row appears in the Connections list.

Expected UI result:

- the connection row is visible
- `Stored token` shows `Yes`
- the raw token is not shown anywhere after submit
- no token value appears in URL, rendered text, or follow-up API responses

Expected data result:

- a row exists in `public.instagram_connections`
- `owner_user_id` matches the signed-in user
- `access_token_encrypted` is populated
- `label` matches the submitted value

### 2. Resolve IDs

Steps:

1. Click `Resolve IDs` on the created connection.
2. Wait for the list reload.

Expected UI result:

- success case: `IG User ID` is populated and `connection_status` remains `active`
- failure case: the UI shows the friendly 422 message about permissions or unsupported Instagram account linkage

Expected data result:

- `ig_user_id` is updated on success
- `page_id` is currently expected to remain `null`

### 3. Refresh token

Steps:

1. Click `Refresh token` on the same connection.
2. Wait for the list reload.

Expected UI result:

- success case: `last_refreshed_at` changes and `refresh_status` becomes `ok`
- failure case: the UI shows the friendly 422 message for invalid/revoked/mis-scoped tokens or a generic upstream error for other failures

Expected data result:

- `last_refreshed_at` is updated on success
- `token_expires_at` is updated when Instagram returns `expires_in`
- `refresh_error` is cleared on success

### 4. Edit connection

Steps:

1. Click `Edit`.
2. Change the label only and save.
3. Re-open `Edit`, paste a replacement access token, and save.

Expected UI result:

- label-only update persists
- replacement token is accepted without revealing the previous token
- the UI still never exposes the stored token value

Expected data result:

- `label` changes after the first save
- `access_token_encrypted` changes after the replacement-token save

### 5. Delete connection

Steps:

1. Click `Delete` and accept the confirmation dialog.
2. Wait for the list reload.

Expected UI result:

- the connection row disappears
- a page refresh does not bring it back

Expected data result:

- the row is removed from `public.instagram_connections`

## Suggested SQL spot checks

Use a safe user-specific filter when checking rows:

```sql
select id, owner_user_id, label, ig_user_id, page_id, token_expires_at, last_refreshed_at, refresh_status, refresh_error, connection_status, created_at, updated_at
from public.instagram_connections
where owner_user_id = '<signed_in_user_uuid>'
order by created_at desc;
```

Only if you need to confirm encrypted storage exists:

```sql
select id, owner_user_id, access_token_encrypted is not null as has_encrypted_token
from public.instagram_connections
where owner_user_id = '<signed_in_user_uuid>'
order by created_at desc;
```

## Hosted vs repo delta

None. Hosted connection functions are aligned with the repo, including the `refresh-instagram-connection` hardening.

## Exit condition for Slice B

Met. Slice B completed during the Supabase cutover.
