import type Database from 'better-sqlite3'
import { httpGetJson } from './http.js'

// Instagram User access token refresh (long-lived)
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

type ExtendTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

type InstagramTokenRow = {
  id: string
  access_token: string
  expires_at: string | null
  last_refreshed_at: string | null
  refresh_status: string | null
  refresh_error: string | null
  created_at: string
  updated_at: string
}

type Logger = {
  info?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

type AutoRefreshConfig = {
  enabled: boolean
  pollMs: number
  windowDays: number
  minIntervalHours: number
  staleRefreshingMinutes: number
  maxPerTick: number
}

function nowIso() {
  return new Date().toISOString()
}

function plusSecondsIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function parseIntEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? Math.trunc(v) : fallback
}

function parseFloatEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

export function getInstagramTokenAutoRefreshConfig(): AutoRefreshConfig {
  return {
    enabled: (process.env.IG_TOKEN_AUTO_REFRESH ?? '1') !== '0',
    pollMs: parseIntEnv('IG_TOKEN_REFRESH_POLL_MS', 60 * 60 * 1000),
    windowDays: parseFloatEnv('IG_TOKEN_REFRESH_WINDOW_DAYS', 7),
    minIntervalHours: parseFloatEnv('IG_TOKEN_REFRESH_MIN_INTERVAL_HOURS', 24),
    staleRefreshingMinutes: parseFloatEnv('IG_TOKEN_REFRESH_STALE_REFRESHING_MINUTES', 30),
    maxPerTick: parseIntEnv('IG_TOKEN_REFRESH_MAX_PER_TICK', 10),
  }
}

function parseIsoMs(value: string | null) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function shouldRefreshToken(row: InstagramTokenRow, nowMs: number, cfg: AutoRefreshConfig) {
  const staleRefreshingMs = cfg.staleRefreshingMinutes * 60 * 1000
  const updatedMs = parseIsoMs(row.updated_at) ?? 0

  if (row.refresh_status === 'refreshing' && nowMs - updatedMs < staleRefreshingMs) return false

  const lastAttemptMs = parseIsoMs(row.last_refreshed_at)
  const minIntervalMs = cfg.minIntervalHours * 60 * 60 * 1000
  if (lastAttemptMs !== null && nowMs - lastAttemptMs < minIntervalMs) return false

  const expiresMs = parseIsoMs(row.expires_at)
  if (expiresMs === null) {
    // If we don't have an expiry recorded yet, try to refresh occasionally so we can start tracking.
    return true
  }

  const windowMs = cfg.windowDays * 24 * 60 * 60 * 1000
  return expiresMs - nowMs <= windowMs
}

async function refreshTokenUpstream(accessToken: string) {
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', accessToken)
  const data = await httpGetJson<ExtendTokenResponse>(url.toString())
  const expiresAt = typeof data.expires_in === 'number' ? plusSecondsIso(data.expires_in) : null
  return { accessToken: data.access_token, expiresAt }
}

export async function refreshInstagramToken(db: Database.Database, args: { id: string; logger?: Logger }) {
  const token = db.prepare('SELECT * FROM instagram_tokens WHERE id = ?').get(args.id) as InstagramTokenRow | undefined
  if (!token) return { ok: false as const, id: args.id, expiresAt: null as null }

  const cfg = getInstagramTokenAutoRefreshConfig()
  const now = Date.now()
  const staleBeforeIso = new Date(now - cfg.staleRefreshingMinutes * 60 * 1000).toISOString()

  const claimed = db
    .prepare(
      `UPDATE instagram_tokens
       SET refresh_status = ?, refresh_error = ?, updated_at = ?
       WHERE id = ?
         AND (refresh_status IS NULL OR refresh_status != 'refreshing' OR updated_at < ?)`
    )
    .run('refreshing', null, nowIso(), args.id, staleBeforeIso)

  if (claimed.changes === 0) return { ok: false as const, id: args.id, expiresAt: null as null }

  try {
    const res = await refreshTokenUpstream(token.access_token)

    db.prepare(
      `UPDATE instagram_tokens SET
        access_token = ?,
        expires_at = ?,
        last_refreshed_at = ?,
        refresh_status = ?,
        refresh_error = ?,
        updated_at = ?
      WHERE id = ?`
    ).run(res.accessToken, res.expiresAt, nowIso(), 'ok', null, nowIso(), args.id)

    args.logger?.info?.({ msg: 'ig-token-refresh-ok', id: args.id, expiresAt: res.expiresAt })
    return { ok: true as const, id: args.id, expiresAt: res.expiresAt }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)

    db.prepare(
      `UPDATE instagram_tokens SET
        refresh_status = ?,
        refresh_error = ?,
        last_refreshed_at = ?,
        updated_at = ?
      WHERE id = ?`
    ).run('error', msg, nowIso(), nowIso(), args.id)

    args.logger?.error?.({ msg: 'ig-token-refresh-error', id: args.id, error: msg })
    throw e
  }
}

export async function refreshInstagramTokensDue(db: Database.Database, args?: { logger?: Logger }) {
  const cfg = getInstagramTokenAutoRefreshConfig()
  if (!cfg.enabled) return { attempted: 0, refreshed: 0, skipped: 0 }

  const rows = db
    .prepare(
      `SELECT id, access_token, expires_at, last_refreshed_at, refresh_status, refresh_error, created_at, updated_at
       FROM instagram_tokens`
    )
    .all() as InstagramTokenRow[]

  const nowMs = Date.now()
  const due = rows.filter((r) => shouldRefreshToken(r, nowMs, cfg))

  // Prioritize the ones closest to expiry (nulls last)
  due.sort((a, b) => {
    const am = parseIsoMs(a.expires_at)
    const bm = parseIsoMs(b.expires_at)
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
    try {
      const res = await refreshInstagramToken(db, { id: row.id, logger: args?.logger })
      if (res.ok) refreshed += 1
      else skipped += 1
    } catch {
      // Error details already persisted + logged.
    }
  }

  if (attempted > 0) {
    args?.logger?.info?.({ msg: 'ig-token-refresh-tick', attempted, refreshed, skipped })
  }

  return { attempted, refreshed, skipped }
}
