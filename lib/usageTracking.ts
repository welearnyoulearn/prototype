import pool from '@/lib/db'

// Platform usage analytics — one session row per login, kept alive by client
// heartbeats (see /api/usage/heartbeat) until the browser stops pinging or
// the JWT expires. Deliberately fire-and-forget everywhere it's called: a
// failure here must never block or slow down a real login/heartbeat/logout.

export async function recordSessionStart(params: {
  schoolId: number | null
  actorId: number
  actorRole: string
  actorName: string | null
}): Promise<number | null> {
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO usage_sessions (school_id, actor_id, actor_role, actor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [params.schoolId, params.actorId, params.actorRole, params.actorName]
    )
    return row.id as number
  } catch {
    return null
  }
}

export async function recordHeartbeat(sessionId: number): Promise<void> {
  try {
    await pool.query('UPDATE usage_sessions SET last_seen_at = NOW() WHERE id = $1 AND ended_at IS NULL', [sessionId])
  } catch { /* fire-and-forget */ }
}

export async function recordSessionEnd(sessionId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE usage_sessions
       SET ended_at = NOW(), duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at))::int)
       WHERE id = $1 AND ended_at IS NULL`,
      [sessionId]
    )
  } catch { /* fire-and-forget */ }
}

// A heartbeat that never arrives again (tab closed without a logout click,
// laptop slept, etc.) leaves a session open forever otherwise. Called by the
// daily rollup job: any session whose last_seen_at is older than this is
// closed out using last_seen_at as the effective end time, not NOW() — the
// duration should reflect when they actually stopped, not when we happened
// to notice.
export const STALE_SESSION_MINUTES = 10

export async function closeStaleSessions(): Promise<number> {
  try {
    const { rowCount } = await pool.query(
      `UPDATE usage_sessions
       SET ended_at = last_seen_at,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at))::int)
       WHERE ended_at IS NULL AND last_seen_at < NOW() - INTERVAL '${STALE_SESSION_MINUTES} minutes'`
    )
    return rowCount ?? 0
  } catch {
    return 0
  }
}

// Feature-level usage — records one row per nav/tab open. Called from each
// portal's single navigateTo(key) function, so every module switch is
// captured without wiring individual buttons. Fire-and-forget like the rest
// of this file: a tracking failure must never block navigation.
export async function recordFeatureOpen(params: {
  schoolId: number | null
  actorId: number
  actorRole: string
  portal: string
  navKey: string
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO feature_usage_events (school_id, actor_id, actor_role, portal, nav_key)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.schoolId, params.actorId, params.actorRole, params.portal, params.navKey]
    )
  } catch { /* fire-and-forget */ }
}
