import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Migration = {
  id: string; // e.g. 20260306135500_init
  filename: string;
  sql: string;
};

function parseMigrationId(filename: string) {
  const m = filename.match(/^(\d{14})_.+\.sql$/);
  if (!m) {
    throw new Error(
      `Invalid migration filename: ${filename}. Expected: YYYYMMDDHHMMSS_name.sql`
    );
  }
  return m[1];
}

export async function loadMigrations(migrationsDir: string): Promise<Migration[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations: Migration[] = [];
  for (const filename of files) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    migrations.push({
      id: parseMigrationId(filename),
      filename,
      sql,
    });
  }
  return migrations;
}

export function ensureMigrationsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function appliedMigrationIds(db: Database.Database): Set<string> {
  const rows = db
    .prepare('SELECT id FROM migrations ORDER BY id ASC')
    .all() as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

export async function migrate({
  dbPath,
  migrationsDir,
}: {
  dbPath: string;
  migrationsDir: string;
}) {
  const db = new Database(dbPath);

  // Good default pragmas for an app DB
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  ensureMigrationsTable(db);
  const applied = appliedMigrationIds(db);
  const migrations = await loadMigrations(migrationsDir);

  const toApply = migrations.filter((m) => !applied.has(m.id));
  if (toApply.length === 0) return { applied: 0 };

  const applyTx = db.transaction(() => {
    for (const m of toApply) {
      db.exec(m.sql);
      db.prepare(
        'INSERT INTO migrations (id, filename) VALUES (?, ?)'
      ).run(m.id, m.filename);
    }
  });

  applyTx();
  return { applied: toApply.length };
}
