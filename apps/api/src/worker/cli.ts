import { runWebhookWorker } from './events.js'

runWebhookWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
