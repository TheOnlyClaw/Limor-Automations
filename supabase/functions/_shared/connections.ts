export type SafeConnectionRow = {
  id: string
  label: string | null
  ig_user_id: string | null
  page_id: string | null
  token_expires_at: string | null
  last_refreshed_at: string | null
  refresh_status: string | null
  refresh_error: string | null
  connection_status: string
  created_at: string
  updated_at: string
}

export const safeConnectionSelect = [
  'id',
  'label',
  'ig_user_id',
  'page_id',
  'token_expires_at',
  'last_refreshed_at',
  'refresh_status',
  'refresh_error',
  'connection_status',
  'created_at',
  'updated_at',
].join(',')

export function toSafeConnection(row: SafeConnectionRow) {
  return {
    id: row.id,
    label: row.label,
    igUserId: row.ig_user_id,
    pageId: row.page_id,
    expiresAt: row.token_expires_at,
    lastRefreshedAt: row.last_refreshed_at,
    refreshStatus: row.refresh_status,
    refreshError: row.refresh_error,
    connectionStatus: row.connection_status,
    hasStoredAccessToken: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
