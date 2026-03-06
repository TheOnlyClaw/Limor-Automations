import type { FastifyReply } from 'fastify'

export function sendError(reply: FastifyReply, code: number, message: string) {
  return reply.code(code as any).send({ message } as any)
}
