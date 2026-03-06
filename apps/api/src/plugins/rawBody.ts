import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

// Captures the raw request body as a UTF-8 string for signature verification.
// This is applied only to routes that need it (webhooks).
export const rawBodyPlugin: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    async (req: any, body: Buffer) => {
      ;(req as any).rawBody = body.toString('utf8')
      // Let Fastify try to parse JSON downstream using its built-in parser
      // by returning the raw string for application/json.
      const contentType = (req.headers['content-type'] ?? '').toString()
      if (contentType.includes('application/json')) {
        return JSON.parse(body.toString('utf8'))
      }
      return body
    }
  )
}

export default fp(rawBodyPlugin, { name: 'rawBody' })
