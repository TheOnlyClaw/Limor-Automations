import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts'
import { decryptString, encryptString } from '../_shared/crypto.ts'
import { GraphError, graphGetJson } from '../_shared/instagramGraph.ts'
import { requireUser } from '../_shared/auth.ts'
import { createAdminClient } from '../_shared/supabase.ts'

declare const Deno: any

type RefreshResponse = {
  access_token: string
  expires_in?: number
}

type ConnectionRow = {
  id: string
  access_token_encrypted: string
  token_expires_at: string | null
  last_refreshed_at: string | null
  refresh_status: string | null
  refresh_error: string | null
  updated_at: string
  connection_status: string
}

type AutoRefreshConfig = {
  enabled: boolean
  windowDays: number
  minIntervalHours: number
  staleRefreshingMinutes: number
  maxPerTick: number
}

function nowIso() {
  return new Date().toISOString()
}

function plusSecondsIso(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function parseIntEnv(name: string, fallback: number) {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? Math.trunc(v) : fallback
}

function parseFloatEnv(name: string, fallback: number) {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

function parseIsoMs(value: string | null) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function getInstagramTokenAutoRefreshConfig(): AutoRefreshConfig {
  return {
    enabled: (Deno.env.get('IG_TOKEN_AUTO_REFRESH') ?? '1') !== '0',
    windowDays: parseFloatEnv('IG_TOKEN_REFRESH_WINDOW_DAYS', 7),
    minIntervalHours: parseFloatEnv('IG_TOKEN_REFRESH_MIN_INTERVAL_HOURS', 24),
    staleRefreshingMinutes: parseFloatEnv('IG_TOKEN_REFRESH_STALE_REFRESHING_MINUTES', 30),
    maxPerTick: parseIntEnv('IG_TOKEN_REFRESH_MAX_PER_TICK', 10),
  }
}

function shouldRefreshConnection(row: ConnectionRow, nowMs: number, cfg: AutoRefreshConfig) {
  const staleRefreshingMs = cfg.staleRefreshingMinutes * 60 * 1000
  const updatedMs = parseIsoMs(row.updated_at) ?? 0

  if (row.refresh_status === 'refreshing' && nowMs - updatedMs < staleRefreshingMs) return false

  const lastAttemptMs = parseIsoMs(row.last_refreshed_at)
  const minIntervalMs = cfg.minIntervalHours * 60 * 60 * 1000
  if (lastAttemptMs !== null && nowMs - lastAttemptMs < minIntervalMs) return false

  const expiresMs = parseIsoMs(row.token_expires_at)
  if (expiresMs === null) return true

  const windowMs = cfg.windowDays * 24 * 60 * 60 * 1000
  return expiresMs - nowMs <= windowMs
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    await requireUser(req)
  } catch (error) {
    return errorResponse(401, error instanceof Error ? error.message : 'Unauthorized')
  }

  const cfg = getInstagramTokenAutoRefreshConfig()
  if (!cfg.enabled) return jsonResponse({ attempted: 0, refreshed: 0, skipped: 0 })

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('instagram_connections')
    .select(
      'id, access_token_encrypted, token_expires_at, last_refreshed_at, refresh_status, refresh_error, updated_at, connection_status',
    )
    .neq('connection_status', 'disabled')

  if (error) {
    console.error('Failed to load connections for refresh', error)
    return errorResponse(500, 'Unable to refresh tokens')
  }

  const nowMs = Date.now()
  const due = (rows ?? []).filter((row) => shouldRefreshConnection(row as ConnectionRow, nowMs, cfg))

  due.sort((a, b) => {
    const am = parseIsoMs(a.token_expires_at)
    const bm = parseIsoMs(b.token_expires_at)
    if (am === null && bm === null) return 0
    if (am === null) return 1
    if (bm === null) return -1
    return am - bm
  })

  let attempted = 0
  let refreshed = 0
  let skipped = 0

  for (const row of due.slice(0, Math.max(0, cfg.maxPerTick))) {
    attempted += 1
    const staleBeforeIso = new Date(nowMs - cfg.staleRefreshingMinutes * 60 * 1000).toISOString()

    const { data: claimed, error: claimError } = await admin
      .from('instagram_connections')
      .update({ refresh_status: 'refreshing', refresh_error: null })
      .eq('id', row.id)
      .or(`refresh_status.is.null,refresh_status.neq.refreshing,updated_at.lt.${staleBeforeIso}`)
      .select('id')

    if (claimError) {
      console.error('Failed to claim connection for refresh', claimError)
      skipped += 1
      continue
    }

    if (!claimed || claimed.length === 0) {
      skipped += 1
      continue
    }

    try {
      const accessToken = await decryptString(row.access_token_encrypted)
      const refreshedToken = await graphGetJson<RefreshResponse>(
        'refresh_access_token?grant_type=ig_refresh_token',
        accessToken,
      )

      if (!refreshedToken.access_token) throw new Error('Instagram refresh response missing access_token')

      const encryptedToken = await encryptString(refreshedToken.access_token)
      const expiresAt = plusSecondsIso(refreshedToken.expires_in)

      const { error: updateError } = await admin
        .from('instagram_connections')
        .update({
          access_token_encrypted: encryptedToken,
          token_expires_at: expiresAt,
          last_refreshed_at: nowIso(),
          refresh_status: 'ok',
          refresh_error: null,
          connection_status: 'active',
        })
        .eq('id', row.id)

      if (updateError) {
        console.error('Failed to update connection after refresh', updateError)
        skipped += 1
        continue
      }

      refreshed += 1
    } catch (error) {
      const refreshError =
        error instanceof GraphError
          ? 'Instagram refresh failed. Check token permissions or reconnect the account.'
          : 'Refresh failed. Try again later.'

      await admin
        .from('instagram_connections')
        .update({
          refresh_status: 'error',
          refresh_error: refreshError,
          last_refreshed_at: nowIso(),
        })
        .eq('id', row.id)

      if (error instanceof GraphError) {
        console.error('Instagram refresh failed', { status: error.status, message: error.message })
      } else {
        console.error('Instagram refresh failed', error)
      }
    }
  }

  return jsonResponse({ attempted, refreshed, skipped })
})
