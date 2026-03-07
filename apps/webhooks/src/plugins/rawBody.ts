import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

// Captures the raw request body as a UTF-8 string for signature verification.
export const rawBodyPlugin: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser(
    ['application/json', 'application/*+json'],
    { parseAs: 'buffer' },
    async (req: any, body: Buffer) => {
      const raw = body.toString('utf8')
      ;(req as any).rawBody = raw
      if (!raw.trim()) return null
      return JSON.parse(raw)
    },
  )

  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    async (req: any, body: Buffer) => {
      ;(req as any).rawBody = body.toString('utf8')
      return body
    },
  )
}

export default fp(rawBodyPlugin, { name: 'rawBody' })
