# 0001 — SQLite migrations

## Summary
Add a minimal SQLite-backed migration system to the Fastify API.

## Goal
- Create and version-control the DB schema using migrations.
- Allow future features to add their own schema changes as new migrations.

## Non-goals
- No ORM adoption yet.
- No automatic generation from models.
- No multi-DB support.

## Design
### Migration format
- Directory: `apps/api/migrations/`
- Filename format: `YYYYMMDDHHMMSS_name.sql`
- Each file contains raw SQL executed in a transaction.

### Tracking
- A table `migrations(id, filename, applied_at)` tracks applied migrations.
- `id` is derived from the timestamp prefix.

### When migrations run
- On API boot (dev/prod), migrations are applied before opening the DB handle.

### CLI
- `npm run db:migrate` runs migrations without starting the server.

## Operations
### Commands
- Root: `npm run db:migrate`
- API workspace: `npm -w apps/api run db:migrate`

### Environment
- `DB_PATH` (optional): defaults to `apps/api/data/app.sqlite`.

## Acceptance Criteria
- Fresh checkout + `npm i` + `npm run db:migrate` creates the SQLite DB file and `migrations` table.
- Running migrations twice is idempotent (second run applies `0`).
- API `/health` returns `{ ok: true, db: true }` when DB is reachable.

## Future additions
- `npm run db:new <name>` to create new timestamped migration files.
- Database backup/restore commands.
