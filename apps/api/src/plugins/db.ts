import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import path from 'node:path';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof openDb>;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'app.sqlite');
  const migrationsDir = path.join(process.cwd(), 'migrations');

  // Apply migrations on boot (idempotent)
  await migrate({ dbPath, migrationsDir });

  const db = openDb(dbPath);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    db.close();
  });
};

export default fp(plugin, {
  name: 'db',
});
