import Fastify from 'fastify'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dbPlugin from './plugins/db.js'
import rawBodyPlugin from './plugins/rawBody.js'

const app = Fastify({ logger: true })

const here = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(here, '..')

// Default to sharing the API service DB + migrations.
process.env.DB_PATH ??= path.join(serviceDir, '..', 'api', 'data', 'app.sqlite')
process.env.MIGRATIONS_DIR ??= path.join(serviceDir, '..', 'api', 'migrations')

await app.register(dbPlugin)
await app.register(rawBodyPlugin)

app.get('/health', async () => {
  const row = app.db.prepare('SELECT 1 as one').get() as { one: number }
  return { ok: true, db: row.one === 1 }
})

await app.register((await import('./routes/instagramWebhooks.js')).instagramWebhooksRoutes)

const port = Number(process.env.WEBHOOKS_PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

await app.listen({ port, host })
