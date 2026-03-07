const defaultOrigins = ['http://localhost:5173', 'https://theonlyclaw.github.io']
const configuredOrigins = (Deno.env.get('WEB_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins

const resolveOrigin = (req?: Request) => {
  if (!req) return allowedOrigins[0] ?? ''
  const requestOrigin = req.headers.get('origin')
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin
  return allowedOrigins[0] ?? ''
}

export const corsHeaders = (req?: Request) => ({
  'Access-Control-Allow-Origin': resolveOrigin(req),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
})

export function handleCors(req: Request) {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders(req) })
}

export function jsonResponse(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(req),
  })
}

export function errorResponse(status: number, message: string, req?: Request) {
  return jsonResponse({ error: message }, status, req)
}
