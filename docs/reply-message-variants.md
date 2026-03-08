# Reply Message Variants

## Problem
Reply messages are configured as a single template, so replies feel repetitive and robotic.

## Goals
- Allow configuring multiple reply messages per automation.
- Send exactly one reply per comment, chosen at random from the configured replies.
- When AI variation is enabled, provide the AI with all base messages for better examples.
- Keep DM behavior and CTA gating unchanged.

## Non-goals
- No redesign of the automation dialog or DM flow.
- No schema changes unless required by execution logic.
- No new AI provider or model swap.

## Current Flow (Summary)
- UI stores one reply template in the automation draft.
- `automation_actions` stores a single `type = 'reply'` action with `template`.
- Webhook `processExecutions` iterates all actions and sends each matched reply.
- AI variation uses `generateGeminiVariant` with a single `baseMessage`.

## Proposed Behavior
- Reply configuration supports a list of templates (1 or more).
- For each matching comment event, pick one reply template at random and send it.
- Selection is deterministic per event so reprocessing does not produce multiple replies.
- If AI variation is enabled, pass all reply templates to the prompt while still anchoring on the selected base message.

## Data Model
- Reuse `automation_actions` with multiple rows where `type = 'reply'`.
- `automation_executions.action_id` continues to reference the selected reply action.
- No new tables or columns required.

## UI Changes (Automation Dialog)
- Replace the single reply textarea with a tabbed list (similar to DM tabs).
- Add `+ Add reply` and `Remove` controls.
- Update the step label to "Reply messages" and add helper text: "One reply is chosen at random per comment."
- The AI toggle remains at the reply section and applies to all reply templates.
- Validation: when reply is enabled, require at least one non-empty reply template and no empty tabs.

## Client Mapping
- `AutomationDraft`
  - Replace `replyTemplate` with `replyTemplates: string[]`.
- `automationToDraftFields`
  - `replyTemplates` from actions filtered by `type = 'reply'` and ordered by `sort_order`.
  - `replyEnabled` is true if any reply template is non-empty.
  - `replyUseAi` derives from reply actions (normalize mixed values to `true` if any are true).
- `draftToRulesActions`
  - Create one `reply` action per reply template.
  - Apply `useAi: replyUseAi` to every reply action.
  - Preserve DM action order and behavior.

## Webhook Logic
- In `processExecutions`, split actions into `replyActions` and `dmActions`.
- For reply actions:
  - Ignore empty templates.
  - If there is at least one reply action, choose one deterministically:
    - `index = hash(eventId + automationId) % replyActions.length`.
    - Use the existing `sha256Hex` helper to derive a stable integer.
  - Enqueue and send only the selected reply action.
- DM actions continue to behave as they do today (including CTA gating).

## Retry Logic
- `retry-automation-execution` and `retry-automation-executions`:
  - When retrying a reply with `use_ai = true`, load all reply templates for that automation.
  - Call `generateGeminiVariant` with:
    - `baseMessage`: the selected action template.
    - `baseMessages`: all reply templates (trimmed).
    - `commentText`.
  - If AI fails, fall back to the selected `baseMessage` and mark `message_source = 'template'`.

## AI Prompt Update
- Update `buildPrompt` to accept `baseMessages: string[]` in addition to `baseMessage`.
- Prompt format:
  - "SELECTED BASE MESSAGE" section for the chosen template.
  - "OTHER EXAMPLES" list containing all reply templates.
  - Keep existing constraints (single message output, no new facts, same tone).
- Increment `promptVersion` to track the new prompt shape.
- Trim each base message (for example, 500 chars) to keep prompts bounded.

## Edge Cases
- If reply is enabled but all templates are empty, surface a validation error and do not save.
- If only one reply template exists, behavior is identical to today.
- If reply templates change between webhook and retry, retry still uses the selected `action_id` but passes the current template list to AI.

## Implementation Plan
1) Update the automation draft types and mapping helpers.
2) Update the Automation Dialog UI to manage multiple reply templates.
3) Adjust validation in `DashboardPage` to handle reply template arrays.
4) Update webhook execution logic to pick a deterministic random reply action.
5) Update retry handlers to pass all base messages to AI.
6) Update the Gemini prompt builder and bump `promptVersion`.
7) Manual validation on a live post with 3 reply templates and AI on/off.
