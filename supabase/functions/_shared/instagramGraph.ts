type GraphErrorPayload = {
  error?: {
    message?: string
  }
}

export class GraphError extends Error {
  status: number
  payload: unknown | null

  constructor(status: number, message: string, payload: unknown | null = null) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

function getGraphErrorMessage(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const payload = data as GraphErrorPayload
  return typeof payload.error?.message === 'string' && payload.error.message.length ? payload.error.message : null
}

function parseJson(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function graphFetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const text = await res.text()
  const data = parseJson(text)

  if (!res.ok) {
    throw new GraphError(
      res.status,
      getGraphErrorMessage(data) ?? `Instagram request failed (${res.status})`,
      data,
    )
  }

  return data as T
}

export async function graphGetJson<T>(path: string, accessToken: string): Promise<T> {
  const url = new URL(`https://graph.instagram.com/${path}`)
  url.searchParams.set('access_token', accessToken)
  return graphFetchJson<T>(url.toString(), { method: 'GET' })
}

export async function graphPostJson<T>(url: string, body: unknown): Promise<T> {
  return graphFetchJson<T>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function graphPostForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(form)
  return graphFetchJson<T>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
}
