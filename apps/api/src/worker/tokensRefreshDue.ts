import { openDb } from '../db/index.js'
import { refreshInstagramTokensDue } from '../lib/instagramTokenRefresh.js'

async function main() {
  const rawPath = process.env.DB_PATH
    ? new URL(process.env.DB_PATH, `file://${process.cwd()}/`).pathname
    : undefined
  const db = openDb(rawPath)

  try {
    const res = await refreshInstagramTokensDue(db, { logger: console })
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ msg: 'ig-token-refresh-due-done', ...res }))
  } finally {
    db.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
