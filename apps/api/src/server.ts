import Fastify from 'fastify'
import path from 'node:path'
import dbPlugin from './plugins/db.js'
import rawBodyPlugin from './plugins/rawBody.js'

const app = Fastify({ logger: true })

// DB + migrations (SQLite)
// migrations path is relative to apps/api (process.cwd when running workspace script)
process.env.DB_PATH ??= path.join(process.cwd(), 'data', 'app.sqlite')
await app.register(dbPlugin)

// Needed for Meta webhook signature validation
await app.register(rawBodyPlugin)

app.get('/health', async () => {
  // quick sanity check that DB is reachable
  const row = app.db.prepare('SELECT 1 as one').get() as { one: number }
  return { ok: true, db: row.one === 1 }
})

app.get('/api/v1/ping', async () => {
  return { pong: true }
})

await app.register((await import('./routes/instagramTokens.js')).instagramTokensRoutes)
await app.register((await import('./routes/instagramPosts.js')).instagramPostsRoutes)
await app.register((await import('./routes/instagramRefresh.js')).instagramRefreshRoutes)
await app.register((await import('./routes/automations.js')).automationsRoutes)
await app.register((await import('./routes/automationExecutions.js')).automationExecutionsRoutes)
await app.register((await import('./routes/instagramWebhooks.js')).instagramWebhooksRoutes)
await app.register((await import('./routes/instagramBootstrap.js')).instagramBootstrapRoutes)

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

await app.listen({ port, host })
