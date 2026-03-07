import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
function parseMigrationId(filename) {
    const m = filename.match(/^(\d{14})_.+\.sql$/);
    if (!m) {
        throw new Error(`Invalid migration filename: ${filename}. Expected: YYYYMMDDHHMMSS_name.sql`);
    }
    return m[1];
}
export async function loadMigrations(migrationsDir) {
    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile() && e.name.endsWith('.sql'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    const migrations = [];
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
export function ensureMigrationsTable(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
export function appliedMigrationIds(db) {
    const rows = db
        .prepare('SELECT id FROM migrations ORDER BY id ASC')
        .all();
    return new Set(rows.map((r) => r.id));
}
export async function migrate({ dbPath, migrationsDir, }) {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    ensureMigrationsTable(db);
    const applied = appliedMigrationIds(db);
    const migrations = await loadMigrations(migrationsDir);
    const toApply = migrations.filter((m) => !applied.has(m.id));
    if (toApply.length === 0)
        return { applied: 0 };
    const applyTx = db.transaction(() => {
        for (const m of toApply) {
            db.exec(m.sql);
            db.prepare('INSERT INTO migrations (id, filename) VALUES (?, ?)').run(m.id, m.filename);
        }
    });
    applyTx();
    return { applied: toApply.length };
}
