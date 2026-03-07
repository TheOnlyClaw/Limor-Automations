export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//.test(value)
}

function normalizeJoinedUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath
  }
  return `${normalizedBase}${normalizedPath}`
}

export function buildApiUrl(path: string): string {
  if (!apiBaseUrl || isAbsoluteUrl(path)) return path
  if (apiBaseUrl.startsWith('/')) return normalizeJoinedUrl(apiBaseUrl, path)
  return normalizeJoinedUrl(apiBaseUrl, path)
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function getServerMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.message === 'string' && d.message.length) return d.message
  if (typeof d.error === 'string' && d.error.length) return d.error
  return null
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const resolvedInput = typeof input === 'string' ? buildApiUrl(input) : input
  const res = await fetch(resolvedInput, init)
  const text = await res.text()

  if (!res.ok) {
    const data = tryParseJson(text)
    const message = getServerMessage(data) ?? (text || res.statusText)

    throw new ApiError(res.status, message)
  }

  if (!text) return null as T
  return JSON.parse(text) as T
}
