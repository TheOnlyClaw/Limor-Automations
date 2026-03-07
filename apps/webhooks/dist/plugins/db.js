import fp from 'fastify-plugin';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/index.js';
const plugin = async (app) => {
    const dbPath = process.env.DB_PATH;
    if (!dbPath)
        throw new Error('DB_PATH is not set');
    const migrateOnBoot = (process.env.DB_MIGRATE_ON_BOOT ?? '0') !== '0';
    if (migrateOnBoot) {
        const migrationsDir = process.env.MIGRATIONS_DIR;
        if (!migrationsDir)
            throw new Error('MIGRATIONS_DIR is not set');
        await migrate({ dbPath, migrationsDir });
    }
    const db = openDb(dbPath);
    app.decorate('db', db);
    app.addHook('onClose', async () => {
        db.close();
    });
};
export default fp(plugin, {
    name: 'db',
});
