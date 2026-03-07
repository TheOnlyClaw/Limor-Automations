import { buildApiUrl, fetchJson } from '../lib/api'

export type InstagramToken = {
  id: string
  label: string | null
  accessToken: string
  igUserId: string | null
  expiresAt: string | null
  lastRefreshedAt: string | null
  refreshStatus: string | null
  refreshError: string | null
  createdAt: string
  updatedAt: string
}

export async function listInstagramTokens(): Promise<InstagramToken[]> {
  return fetchJson<InstagramToken[]>(buildApiUrl('/api/v1/instagram-tokens'))
}

export async function createInstagramToken(body: {
  label?: string
  accessToken: string
  igUserId?: string
}): Promise<InstagramToken> {
  return fetchJson<InstagramToken>(buildApiUrl('/api/v1/instagram-tokens'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function patchInstagramToken(
  id: string,
  body: {
    label?: string | null
    accessToken?: string
    igUserId?: string | null
  },
): Promise<InstagramToken> {
  return fetchJson<InstagramToken>(buildApiUrl(`/api/v1/instagram-tokens/${id}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteInstagramToken(id: string): Promise<void> {
  await fetchJson<null>(buildApiUrl(`/api/v1/instagram-tokens/${id}`), {
    method: 'DELETE',
  })
}

export async function refreshInstagramToken(id: string): Promise<{ ok: boolean; id: string; expiresAt: string | null }> {
  return fetchJson<{ ok: boolean; id: string; expiresAt: string | null }>(
    buildApiUrl(`/api/v1/instagram-tokens/${id}/refresh`),
    { method: 'POST' },
  )
}

export async function resolveInstagramTokenIds(
  id: string,
): Promise<{ id: string; page_id: string | null; ig_user_id: string }> {
  return fetchJson<{ id: string; page_id: string | null; ig_user_id: string }>(
    buildApiUrl(`/api/v1/instagram-tokens/${id}/resolve-ids`),
    { method: 'POST' },
  )
}
