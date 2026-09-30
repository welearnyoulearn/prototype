import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import pool from './db'

type Limit = { maxAttempts: number; windowSeconds: number; blockSeconds: number }

export const LOGIN_LIMIT: Limit = { maxAttempts: 8, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }
export const RECOVERY_LIMIT: Limit = { maxAttempts: 4, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function clientAddress(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown').slice(0, 128)
}

async function consume(key: string, limit: Limit): Promise<boolean> {
  const result = await pool.query<{ blocked: boolean }>(
    `WITH cleanup AS (
       DELETE FROM auth_rate_limits WHERE updated_at < NOW() - INTERVAL '7 days'
     )
     INSERT INTO auth_rate_limits (key_hash, attempts, window_started_at, blocked_until, updated_at)
     VALUES ($1, 1, NOW(), NULL, NOW())
     ON CONFLICT (key_hash) DO UPDATE SET
       attempts = CASE
         WHEN auth_rate_limits.window_started_at <= NOW() - make_interval(secs => $2) THEN 1
         ELSE auth_rate_limits.attempts + 1
       END,
       window_started_at = CASE
         WHEN auth_rate_limits.window_started_at <= NOW() - make_interval(secs => $2) THEN NOW()
         ELSE auth_rate_limits.window_started_at
       END,
       blocked_until = CASE
         WHEN auth_rate_limits.blocked_until > NOW() THEN auth_rate_limits.blocked_until
         WHEN auth_rate_limits.window_started_at <= NOW() - make_interval(secs => $2) THEN NULL
         WHEN auth_rate_limits.attempts + 1 >= $3 THEN NOW() + make_interval(secs => $4)
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING blocked_until > NOW() AS blocked`,
    [digest(key), limit.windowSeconds, limit.maxAttempts, limit.blockSeconds],
  )
  return result.rows[0]?.blocked !== true
}

export async function checkAuthRateLimit(
  req: NextRequest,
  scope: string,
  identifier: string,
  limit: Limit,
): Promise<boolean> {
  const normalized = identifier.trim().toLowerCase().slice(0, 320)
  const ip = clientAddress(req)
  const [ipAllowed, identityAllowed] = await Promise.all([
    consume(`${scope}:ip:${ip}`, limit),
    consume(`${scope}:identity:${normalized}`, limit),
  ])
  return ipAllowed && identityAllowed
}

export async function clearAuthRateLimit(req: NextRequest, scope: string, identifier: string): Promise<void> {
  const normalized = identifier.trim().toLowerCase().slice(0, 320)
  const ip = clientAddress(req)
  await pool.query(
    `DELETE FROM auth_rate_limits WHERE key_hash = ANY($1::text[])`,
    [[digest(`${scope}:ip:${ip}`), digest(`${scope}:identity:${normalized}`)]],
  )
}
