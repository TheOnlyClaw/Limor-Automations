type GraphErrorPayload = {
  error?: {
    message?: string
  }
}

export class GraphError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function getGraphErrorMessage(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const payload = data as GraphErrorPayload
  return typeof payload.error?.message === 'string' && payload.error.message.length ? payload.error.message : null
}

export async function graphGetJson<T>(path: string, accessToken: string): Promise<T> {
  const url = new URL(`https://graph.instagram.com/${path}`)
  url.searchParams.set('access_token', accessToken)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const text = await res.text()
  const data = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  })()

  if (!res.ok) {
    throw new GraphError(res.status, getGraphErrorMessage(data) ?? `Instagram request failed (${res.status})`)
  }

  return data as T
}
