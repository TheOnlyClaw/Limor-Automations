import path from 'node:path';
import Database from 'better-sqlite3';

export function openDb(dbPath?: string) {
  const file = dbPath ?? process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'app.sqlite');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
