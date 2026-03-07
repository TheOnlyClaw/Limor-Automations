# Repository Agents Guide

This file gives repository-specific instructions to coding agents working in `limor-automations`.

## Project Snapshot

- Product purpose: this app is an interface for the repo owner’s mother to automate DMs and replies on her Instagram posts.
- Monorepo managed with npm workspaces.
- Main apps:
    - `apps/api`: Fastify + TypeScript + SQLite (`better-sqlite3`).
    - `apps/web`: React 19 + Vite + Tailwind CSS.
- Specs live in `openspec/` and should guide changes before implementation.
- Package manager is npm. Lockfile is `package-lock.json`.
- Module system is ESM across the repo.

## Repository Layout

- `apps/api/src/server.ts`: API bootstrap.
- `apps/api/src/routes/`: Fastify route modules.
- `apps/api/src/lib/`: small HTTP/reply helpers.
- `apps/api/src/plugins/`: Fastify plugins such as DB/raw body support.
- `apps/api/src/db/`: SQLite open/migration utilities and CLI entrypoints.
- `apps/api/src/worker/`: webhook worker loop and execution logic.
- `apps/web/src/`: React entrypoint, app shell, and Tailwind styles.
- `openspec/`: architecture, conventions, and stack docs.

## Existing Rule Files

- No repo-local `/.cursor/rules/` files were found.
- No repo-local `/.cursorrules` file was found.
- No repo-local `/.github/copilot-instructions.md` file was found.
- This `AGENTS.md` is therefore the main agent guidance file at repo root.

## Working Agreement

- Check `openspec/README.md`, `openspec/conventions.md`, and related spec docs before major changes.
- Prefer updating specs first when changing API shape, architecture, or workflow.
- Keep dependencies minimal; do not add libraries unless the current stack is clearly insufficient.
- Favor small, readable modules over heavy abstractions.
- Preserve the current minimal full-stack architecture unless the user asks for a broader redesign.

## Install And Dev Commands

- Install dependencies: `npm install`
- Run both apps in dev: `npm run dev`
- Run API only: `npm run dev:api`
- Run web only: `npm run dev:web`
- Run all builds: `npm run build`
- Run all available lint tasks: `npm run lint`
- Run all available type checks: `npm run typecheck`
- Run DB migrations through the workspace script: `npm run db:migrate`
- Run webhook worker through the workspace script: `npm run worker:events`

## Workspace-Specific Commands

- API dev server: `npm -w apps/api run dev`
- API build: `npm -w apps/api run build`
- API typecheck: `npm -w apps/api run typecheck`
- API DB migrate CLI: `npm -w apps/api run db:migrate`
- API worker CLI: `npm -w apps/api run worker:events`
- Web dev server: `npm -w apps/web run dev`
- Web build: `npm -w apps/web run build`
- Web lint: `npm -w apps/web run lint`
- Web typecheck (no script exists, use tool directly): `npm -w apps/web exec tsc -b`

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

- For API-only changes, at minimum run `npm -w apps/api run typecheck`.
- For web-only changes, at minimum run `npm -w apps/web run lint` and `npm -w apps/web exec tsc -b`.
- For cross-cutting changes, prefer `npm run build` plus `npm run lint` plus `npm run typecheck`.
- If a command is unavailable in a workspace, say so plainly instead of papering over it.

## TypeScript Rules

- Keep TypeScript strict; both apps are configured with `strict: true`.
- Avoid `any` in new code. Existing `as any` casts exist around Fastify/SQLite boundaries; reduce them when practical.
- Prefer explicit local types for DB rows, API payloads, and external API responses.
- Keep helper return types obvious; add explicit return types when the function is reused or non-trivial.
- Use narrow unions for status and action fields, matching the current worker code style.

## Imports And Modules

- Use ESM imports everywhere.
- In `apps/api`, use relative imports with the runtime `.js` suffix for local modules.
- Prefer `import type` for type-only Fastify or library imports.
- Prefer grouping imports in this order: external packages, Node built-ins, then local files.
- Keep imports minimal; remove unused imports rather than suppressing lints.

## Naming Conventions

- Use `camelCase` for variables, params, helpers, and functions.
- Use `PascalCase` for React components and schema/type aliases that represent a named concept.
- Use `UPPER_SNAKE_CASE` only for environment variable names.
- Use `snake_case` only when mirroring DB columns or third-party payload fields.
- Route plugins should be named `somethingRoutes`.
- Database row types should be named `SomethingRow`.
- Input/schema helpers should use names like `RuleInput`, `ActionInput`, or `TokenSchema`.

## Formatting Conventions

- Match the existing file style before normalizing formatting.
- Most handwritten app code currently uses 2-space indentation and no semicolons.
- Some generated/older API files use semicolons; do not churn files just to restyle them.
- Keep lines readable and prefer multi-line SQL/template literals when queries are non-trivial.
- Prefer trailing commas in multi-line arrays/objects/calls when the surrounding file uses them.

## API Design Conventions

- Follow the existing REST style in `apps/api/src/routes/`.
- Prefix new public API endpoints with `/api/v1`.
- Define Fastify schemas with TypeBox for `params`, `querystring`, `body`, and `response` whenever practical.
- Keep response shapes predictable and JSON-friendly.
- Reuse small helpers like `sendError` and `httpGetJson` instead of duplicating transport logic.
- Keep route-local helpers close to the route when they are not shared elsewhere.

## Error Handling

- Prefer early returns for validation and not-found paths.
- Use `sendError(reply, statusCode, message)` for expected JSON API errors.
- Use `req.log.error({ err, ...context }, 'message')` for server-side failures.
- Map failures intentionally: validation -> `400`, auth/signature -> `401/403`, missing records -> `404`, missing config -> `500`, upstream failures -> `502`.
- When handling retries or dedupe behavior, log useful context without leaking secrets.

## Database And Worker Conventions

- Treat SQLite as the source of truth for persisted automation/workflow state.
- Wrap related multi-statement writes in `app.db.transaction(...)`.
- Keep SQL explicit and readable; avoid over-abstracting query builders.
- Preserve DB column naming as snake_case.
- Keep worker status values and retry behavior explicit rather than implicit.
- When adding migrations, follow the existing `YYYYMMDDHHMMSS_name.sql` pattern.

## Environment Variables

- Existing code uses env vars such as `DB_PATH`, `PORT`, `HOST`, `FB_APP_ID`, `FB_APP_SECRET`, `FB_GRAPH_VERSION`, `IG_WEBHOOK_VERIFY_TOKEN`, and `META_APP_SECRET`.
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
- If a route or worker function becomes too dense, extract a focused helper instead of adding nested complexity.

## Preferred Verification Flow

- API change: `npm -w apps/api run typecheck`
- Web change: `npm -w apps/web run lint` and `npm -w apps/web exec tsc -b`
- Both apps changed: `npm run build` and `npm run lint` and `npm run typecheck`
- DB/migration change: run `npm run db:migrate` against a safe local DB path if needed.
