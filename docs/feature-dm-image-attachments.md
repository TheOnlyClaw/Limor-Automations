# DM Image Attachments (Supabase Storage)

## Summary
Add support for attaching **one image** to a Direct Message (DM). The user can optionally send text alongside the image. Images are uploaded to **Supabase Storage (S3-compatible object storage)** and the DM message stores a reference to the uploaded object.

This document specifies:
- User experience requirements
- Data model options
- Storage bucket/path conventions
- Upload + rendering flows
- Security (RLS + Storage access)
- Edge cases and acceptance criteria

---

## Goals
- Allow sending **text-only**, **image-only**, or **text + image** DM messages.
- Store images in Supabase Storage bucket `dm-attachments`.
- Ensure only conversation participants can access attachments.

## Non-goals (v1)
- Multiple attachments per message.
- Non-image attachments (PDF, video, etc.).
- Automatic image resizing/compression (can be added later).

---

## UX / Product Requirements

### DM Composer (input)
- Add an **Attach image** button (icon button).
- File picker constraints:
  - `accept="image/*"`
  - Allowed mime types for v1: `image/jpeg`, `image/png`, `image/webp` (optionally `image/gif` if desired).
- After selection:
  - Show a **thumbnail preview**.
  - Show filename + file size.
  - Provide **Remove** (clears the attachment).
- Send button rules:
  - If both text and attachment are empty: **disabled**.
  - If text is empty but attachment exists: **allowed** (image-only message).
  - If attachment is empty but text exists: **allowed** (normal DM).

### Message rendering
- If message has an attached image:
  - Render an inline preview inside the message bubble.
  - Cap display size (e.g., max width 240–320px, keep aspect ratio).
  - Clicking opens full-size image (new tab or modal).
- If message has text + image:
  - Render both in the same message bubble.

### Validation
- Max file size: **10MB** (tunable constant).
- Reject unsupported types with a clear error.

---

## Data Model

### Option A (recommended for v1): attachment fields on `messages`
Add nullable columns to the DM messages table:
- `attachment_type` (text) — `'image'` or `NULL`
- `attachment_bucket` (text) — `'dm-attachments'`
- `attachment_path` (text) — storage object path
- `attachment_mime` (text)
- `attachment_size` (int8)
- `attachment_width` (int, nullable)
- `attachment_height` (int, nullable)

Pros:
- Simple and fast.
- Works well for 0/1 attachment.

Cons:
- Harder to extend to multiple attachments.

### Option B: `message_attachments` table (future)
If we expect multi-attachment or different attachment types soon, introduce a separate table.

---

## Storage Design (Supabase Storage)

### Bucket
- Bucket name: `dm-attachments`
- Visibility: **private** (recommended)

### Object path convention
Use a path that is scoped to the conversation and message:

```
{conversationId}/{messageId}/{uuid}.{ext}
```

Benefits:
- Easy cleanup by conversation/message.
- Enables security checks via path prefix.

---

## Upload + Send Flow (recommended)

### Why this flow
We want stable IDs for storage paths and to avoid orphan attachments.

### Steps
1. User selects image; client validates type/size.
2. User presses **Send**.
3. Client creates the DM message row first (attachment fields still null).
4. Client uploads the file to Supabase Storage using a path that includes `messageId`.
5. Client updates the message row with attachment metadata (bucket/path/mime/size/etc.).

### Failure handling
- If message insert succeeds but upload fails:
  - Mark message as `failed` (if a status field exists) or
  - Keep attachment fields null and show "Upload failed" with a retry option.

---

## Access Control / Security

### Database RLS (messages)
Ensure:
- Only conversation participants can **select** messages.
- Only conversation participants can **insert** messages.
- Only the sender (or a controlled server process) can **update** attachment fields.

### Storage access model (recommended)
- Keep bucket **private**.
- Serve attachments via **signed URLs**.

To generate signed URLs securely:
- Preferred: an **Edge Function** that verifies the caller is a participant in the conversation for the given message, then returns a signed URL.
- Alternate: client uses `createSignedUrl` directly if storage policies reliably enforce participant-only access.

---

## Frontend Implementation Notes

### Composer
State:
- `attachedFile: File | null`
- `previewUrl: string | null` (from `URL.createObjectURL(file)`)

Actions:
- `onAttachClick()` -> file input
- `onFileSelected(file)` -> validate + set state
- `onRemoveAttachment()` -> clear state
- `onSend()` -> insert message -> upload -> update message

### Message bubble
- If `attachment_type === 'image'`:
  - Request/compute a signed URL.
  - Render an `<img>` with constraints.

---

## Edge Cases
- Image-only messages must render correctly.
- Large images should be rejected (v1) or resized (v2).
- Message deletion should remove storage object (background job / edge function / manual cleanup process).

---

## Acceptance Criteria
- DM composer includes attach image button, preview, and remove.
- Can send:
  - text-only
  - image-only
  - text + image
- Uploaded images are stored in Supabase Storage bucket `dm-attachments`.
- Message row stores attachment metadata and object path.
- Only conversation participants can view images (private bucket + signed URL).
- Basic validation for file type and size.

---

## Decisions (confirmed)
- **One attachment per message** (v1).
- **Max image size: 10MB**.
- **Image-only messages are allowed**.

## Decisions (confirmed)
- Storage bucket: **private**.
- Attachment access: **signed URLs**.

## Remaining Open Questions
1. Provide actual table names/fields for:
   - messages
   - conversations
   - conversation participants
