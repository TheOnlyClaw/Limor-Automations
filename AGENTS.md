# Repository Agents Guide

This file gives repository-specific instructions to coding agents working in `limor-automations`.

## Project Snapshot

- Product purpose: this app is an interface for the repo owner’s mother to automate DMs and replies on her Instagram posts.
- Monorepo managed with npm workspaces.
- Main surfaces:
    - `apps/web`: React 19 + Vite + Tailwind CSS.
    - `supabase/`: hosted Supabase migrations + Edge Functions.
- Package manager is npm. Lockfile is `package-lock.json`.
- Module system is ESM across the repo.

## Repository Layout

- `apps/web/src/`: React entrypoint, app shell, and Tailwind styles.
- `supabase/functions/`: Edge Functions and shared helpers.
- `supabase/migrations/`: hosted schema migrations.
- `docs/supabase-migration/`: historical migration notes and validation records.

## Existing Rule Files

- No repo-local `/.cursor/rules/` files were found.
- No repo-local `/.cursorrules` file was found.
- No repo-local `/.github/copilot-instructions.md` file was found.
- This `AGENTS.md` is therefore the main agent guidance file at repo root.

## Working Agreement

- Check `supabase/README.md` and `docs/supabase-migration/README.md` before major schema or Edge Function changes.
- Prefer updating Supabase migrations before app code when changing schema or RLS behavior.
- Keep dependencies minimal; do not add libraries unless the current stack is clearly insufficient.
- Favor small, readable modules over heavy abstractions.
- Preserve the hosted Supabase architecture unless the user asks for a broader redesign.

## Install And Dev Commands

- Install dependencies: `npm install`
- Run web dev server: `npm run dev`
- Run all builds: `npm run build`
- Run lint: `npm run lint`
- Run type checks: `npm run typecheck`

## Workspace-Specific Commands

- Web dev server: `npm -w apps/web run dev`
- Web build: `npm -w apps/web run build`
- Web lint: `npm -w apps/web run lint`
- Web typecheck (no script exists, use tool directly): `npm -w apps/web exec tsc -b`
- Supabase CLI (hosted): `npx supabase link --project-ref <project-ref>`, `npx supabase db push`, `npx supabase functions deploy <function-name>`

## Test Status

- There is currently no `test` script in the root workspace.
- There are currently no `*.test.*` or `*.spec.*` files in the repo.
- Do not claim tests passed unless you added a test runner and executed it.
- For this codebase today, validation usually means `npm run build`, `npm run lint`, and targeted type checks.

## Single-Test Guidance

- There is no single-test command yet because no test framework is configured.
- If you introduce tests, add a package-level `test` script first.
- If you introduce a test runner, also add and document a single-test variant in `package.json`.
- Until then, do not invent commands like `npm test -- foo`; they are not wired up.

## Build/Lint/Verify Expectations

- For web-only changes, at minimum run `npm -w apps/web run lint` and `npm -w apps/web exec tsc -b`.
- For Supabase Edge Function or migration changes, run the web checks if the UI is touched and use the Supabase CLI for deploy/push steps when applicable.
- If a command is unavailable in a workspace, say so plainly instead of papering over it.

## TypeScript Rules

- Keep TypeScript strict; both the web app and Edge Functions use strict settings.
- Avoid `any` in new code.
- Prefer explicit local types for DB rows, API payloads, and external API responses.
- Keep helper return types obvious; add explicit return types when the function is reused or non-trivial.
- Use narrow unions for status and action fields.

## Imports And Modules

- Use ESM imports everywhere.
- Prefer `import type` for type-only imports.
- Prefer grouping imports in this order: external packages, Node built-ins, then local files.
- Keep imports minimal; remove unused imports rather than suppressing lints.

## Naming Conventions

- Use `camelCase` for variables, params, helpers, and functions.
- Use `PascalCase` for React components and schema/type aliases that represent a named concept.
- Use `UPPER_SNAKE_CASE` only for environment variable names.
- Use `snake_case` only when mirroring DB columns or third-party payload fields.
- Database row types should be named `SomethingRow`.
- Input/schema helpers should use names like `RuleInput`, `ActionInput`, or `TokenSchema`.

## Formatting Conventions

- Match the existing file style before normalizing formatting.
- Most handwritten app code currently uses 2-space indentation and no semicolons.
- Some generated files use semicolons; do not churn files just to restyle them.
- Keep lines readable and prefer multi-line SQL/template literals when queries are non-trivial.
- Prefer trailing commas in multi-line arrays/objects/calls when the surrounding file uses them.

## Edge Function Conventions

- Edge Functions live in `supabase/functions/<name>/index.ts`.
- Reuse helpers in `supabase/functions/_shared/` instead of duplicating logic.
- Keep response shapes predictable and JSON-friendly.
- Return consistent status codes and error payloads for expected failures.

## Error Handling

- Prefer early returns for validation and not-found paths.
- Map failures intentionally: validation -> `400`, auth/signature -> `401/403`, missing records -> `404`, missing config -> `500`, upstream failures -> `502`.
- When handling retries or dedupe behavior, log useful context without leaking secrets.

## Database Conventions

- Supabase Postgres is the source of truth for persisted automation/workflow state.
- Keep DB column naming as `snake_case`.
- When adding migrations, follow the existing `YYYYMMDDHHMMSS_name.sql` pattern in `supabase/migrations/`.
- Keep ownership checks and RLS policies explicit for user-scoped data.

## Environment Variables

- Edge Functions use secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_SALT`, and `WEB_ORIGIN`.
- Webhook/runtime functions use `META_APP_SECRET`, `IG_WEBHOOK_VERIFY_TOKEN`, `FB_GRAPH_VERSION`, and `INTERNAL_FUNCTION_SECRET` as needed.
- Read env vars near the boundary where they are used.
- Provide sensible defaults only when the current codebase already does so.
- Fail clearly when required secrets/config are missing.
- Never commit `.env` files or secrets.

## Frontend Conventions

- Use functional React components.
- Keep components small and split UI once a file starts carrying multiple responsibilities.
- Prefer React state/hooks over adding a global state library.
- Use Tailwind utility classes for styling; keep class lists readable and grouped by purpose.
- Preserve the existing visual language unless the task explicitly asks for a redesign.
- Keep accessibility in mind for interactive controls and navigation.

## When Making Changes

- Start with the smallest change that satisfies the request.
- Search for an existing helper/module before creating a new one.
- Do not refactor unrelated files opportunistically.
- Keep comments sparse; add them only when the intent is otherwise hard to recover.
- If a function becomes too dense, extract a focused helper instead of adding nested complexity.

## Preferred Verification Flow

- Web change: `npm -w apps/web run lint` and `npm -w apps/web exec tsc -b`.
- Supabase migration: use `npx supabase db push` against the linked project.
- Supabase Edge Function change: deploy with `npx supabase functions deploy <function-name>` and validate behavior in the hosted project.
