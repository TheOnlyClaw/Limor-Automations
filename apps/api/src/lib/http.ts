export async function httpGetJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  })

  const text = await res.text()
  const data = text ? (JSON.parse(text) as any) : null

  if (!res.ok) {
    const message = (data && (data.error?.message || data.message)) || `HTTP ${res.status}`
    const err = new Error(message)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }

  return data as T
}
