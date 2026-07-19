# Video DM Automation — Implementation Plan

## Summary

Extend the automation engine to support sending video DMs via public MP4 URLs (no file uploads/buffers). Adapts the existing image-attachment pattern — Instagram Graph API accepts `attachment.type: 'video'` with a `payload.url` pointing to a publicly accessible MP4.

## Architecture

```
Frontend (Dialog) ──→ Draft model ──→ API/DB ──→ Webhook ──→ Instagram Graph
  [Video URL input]     [mediaUrl]     [actions]    [sendRecipientDmWithVideo]
```

The existing media pipeline already sends images in the **CTA phase** (post-user-click, via `recipient.id`). We follow the same pattern for video — no pre-CTA media. The key difference is the video URL comes directly from the user (a public MP4 link), not uploaded through Supabase Storage.

---

## Change Breakdown

### 1. DB Migration — Allow `video` media kind + add `media_url` column

**File:** `supabase/migrations/20260312100000_dm_video_media.sql`

- Extend `automation_actions.media_kind` check to `('image', 'video')`
- Add nullable `media_url text` column (stores the public MP4 link)
- Remove the `media_fields_consistency` constraint (bucket/path can be null when using URL)
- Update `replace_automation_children` SP to handle `media_url`

### 2. Instagram Actions — `sendDmWithVideo` / `sendRecipientDmWithVideo`

**File:** `supabase/functions/_shared/instagramActions.ts`

- `sendDmWithVideo(args: { accessToken, senderIgUserId, commentId, videoUrl })` — private reply with video
- `sendRecipientDmWithVideo(args: { accessToken, senderIgUserId, recipientId, videoUrl })` — direct DM with video
- Uses `attachment: { type: 'video', payload: { url: videoUrl, is_reusable: true } }`

### 3. Action Type — Add `mediaUrl` field

**File:** `apps/web/src/automations/mappers.ts`
- `AutomationAction.mediaUrl: string | null` field
- Read from `action.media_url`
- `ActionInput.mediaUrl?: string`

**File:** `apps/web/src/automations/automationsApi.ts`
- `ActionInput.mediaUrl?: string`

### 4. Draft Model — Support video URL alongside image

**File:** `apps/web/src/dashboard/automationDraft.ts`
- `AutomationDraft.dmMediaUrl: string` — the video URL input value
- `AutomationDraft.dmMediaKind: 'image' | 'video' | null`
- `automationToDraftFields()` — read `mediaUrl` from action
- `draftToRulesActions()` — emit `mediaUrl`, `mediaKind: 'video'` when video URL is set

### 5. Frontend — Add video URL input in DM step

**File:** `apps/web/src/dashboard/AutomationDialog.tsx`

- In the media section (step 2), add a toggle between "Image (upload)" and "Video (URL)"
- New props: `onChangeDmVideoUrl`, `onToggleDmMediaMode`
- Video mode shows URL text input instead of file upload
- Preview indicator when URL is set

**File:** `apps/web/src/dashboard/DashboardPage.tsx`
- Wire new props through to `AutomationDialog`
- Handle `dmMediaUrl` in save logic
- Reset video URL when switching modes

### 6. Webhook — Execute video DMs in CTA phase

**File:** `supabase/functions/instagram-webhook/index.ts`

- In the CTA action loop, after the existing image-handling block:
  - Check `media_kind === 'video'` and `media_url` is set
  - Call `sendRecipientDmWithVideo()` with the URL
  - Fall back to text-only if video send fails (same as image)
- Update `ActionRow` type to include media fields
- Update the actions select query to also fetch `media_kind, media_bucket, media_path, media_url, media_enabled`

---

## Task Breakdown

### Task 1: DB migration
- Write migration SQL
- Verify roll-forward

### Task 2: Instagram actions (video helpers)
- Add `sendDmWithVideo` and `sendRecipientDmWithVideo`

### Task 3: Type system updates (mappers + API types)
- Add `mediaUrl` to `AutomationAction`, `ActionInput`, `PostAutomation`

### Task 4: Draft model
- Add `dmMediaUrl` field
- Update `automationToDraftFields` / `draftToRulesActions`

### Task 5: UI — AutomationDialog media mode toggle
- Add video URL input alongside image upload
- Mode toggle

### Task 6: UI — DashboardPage wiring
- Wire new dialog props through state management
- Handle video URL in save validation

### Task 7: Webhook — video execution
- Update actions query, ActionRow type
- Add video send logic in CTA phase with fallback

### Task 8: Verify
- `npm run build` and `npm run lint` pass
