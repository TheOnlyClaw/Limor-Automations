import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
export function openDb(dbPath) {
    const file = dbPath ?? process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'app.sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    return db;
}
