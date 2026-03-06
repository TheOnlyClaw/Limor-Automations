import path from 'node:path';
import { migrate } from './migrate.js';

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'app.sqlite');
const migrationsDir = path.join(process.cwd(), 'migrations');

const res = await migrate({ dbPath, migrationsDir });
console.log(`Migrations applied: ${res.applied}`);
