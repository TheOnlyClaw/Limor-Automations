export type InstagramConnection = {
  id: string
  label: string | null
  igUserId: string | null
  pageId: string | null
  expiresAt: string | null
  lastRefreshedAt: string | null
  refreshStatus: string | null
  refreshError: string | null
  connectionStatus: 'active' | 'reauth_required' | 'disabled'
  hasStoredAccessToken: boolean
  createdAt: string
  updatedAt: string
}

export type CreateInstagramConnectionInput = {
  label?: string
  accessToken: string
  igUserId?: string
}

export type UpdateInstagramConnectionInput = {
  label?: string | null
  igUserId?: string | null
  accessToken?: string
}
