import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

const PAGE_SIZE = 50

// ── GET /api/platform/watchline ──────────────────────────────────────────────
// Query params:
//   type        'request' | 'error' | 'all'   (default 'all')
//   school_id   number                          (optional — filter to one school)
//   severity    'info'|'warn'|'error'|'critical' (error tab only)
//   from        ISO date string                 (default: 7 days ago)
//   to          ISO date string                 (default: now)
//   page        number                          (default 0)
//   export      'csv' | 'json'                 (streams file download when set)
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p         = req.nextUrl.searchParams
  const type      = (p.get('type') || 'all') as 'request' | 'error' | 'all'
  const schoolId  = p.get('school_id') ? Number(p.get('school_id')) : null
  const severity  = p.get('severity')
  const fromDate  = p.get('from') || new Date(Date.now() - 7 * 86400_000).toISOString()
  // Append end-of-day time so a date-only string like '2024-07-03' includes the full day
  const toDateRaw = p.get('to') || new Date().toISOString().slice(0, 10)
  const toDate    = toDateRaw.length === 10 ? `${toDateRaw}T23:59:59.999Z` : toDateRaw
  const page      = Math.max(0, Number(p.get('page') || 0))
  const exportFmt = p.get('export') as 'csv' | 'json' | null

  try {
    // ── Summary stats (always returned) ──
    const summaryWhere: string[] = ['created_at BETWEEN $1 AND $2']
    const summaryVals: unknown[] = [fromDate, toDate]
    if (schoolId) { summaryWhere.push(`school_id = $${summaryVals.push(schoolId)}`); }

    const [reqStats, errStats] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                              AS total_requests,
           COUNT(*) FILTER (WHERE status_code >= 400)           AS error_count,
           COUNT(*) FILTER (WHERE duration_ms > 500)            AS slow_count,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
         FROM request_logs WHERE ${summaryWhere.join(' AND ')}`,
        summaryVals,
      ),
      pool.query(
        `SELECT COUNT(*) AS total_errors,
                COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
                COUNT(*) FILTER (WHERE severity = 'error')    AS error_count
         FROM error_events WHERE ${summaryWhere.join(' AND ')}`,
        summaryVals,
      ),
    ])

    const summary = {
      total_requests: Number(reqStats.rows[0].total_requests),
      error_count:    Number(reqStats.rows[0].error_count),
      slow_count:     Number(reqStats.rows[0].slow_count),
      p50_ms:         Math.round(Number(reqStats.rows[0].p50_ms) || 0),
      p95_ms:         Math.round(Number(reqStats.rows[0].p95_ms) || 0),
      total_errors:   Number(errStats.rows[0].total_errors),
      critical_count: Number(errStats.rows[0].critical_count),
    }

    // ── Top erroring routes ──
    const { rows: topRoutes } = await pool.query(
      `SELECT route, COUNT(*) AS count, MAX(created_at) AS last_seen
       FROM request_logs
       WHERE ${summaryWhere.join(' AND ')} AND status_code >= 400
       GROUP BY route ORDER BY count DESC LIMIT 8`,
      summaryVals,
    )

    // ── Row query ──
    // The bare "created_at" condition below is unambiguous on its own (only
    // request_logs/error_events have it in scope), but every row query here also
    // LEFT JOINs schools for the school name — and schools has its own created_at
    // column too, so the bare reference becomes ambiguous once joined. qualifyDate()
    // swaps in the correct table alias only for the queries that actually join schools.
    const DATE_COND = 'created_at BETWEEN $1 AND $2'
    const qualifyDate = (conds: string[], alias: string) =>
      conds.map(c => c === DATE_COND ? `${alias}.created_at BETWEEN $1 AND $2` : c)

    const where: string[] = [DATE_COND]
    const vals: unknown[] = [fromDate, toDate]
    if (schoolId) where.push(`school_id = $${vals.push(schoolId)}`)

    if (exportFmt) {
      // Full export — no pagination, no limit
      if (type !== 'error') {
        const { rows: rRows } = await pool.query(
          `SELECT rl.*, s.name AS school_name
           FROM request_logs rl
           LEFT JOIN schools s ON s.id = rl.school_id
           WHERE ${qualifyDate(where, 'rl').join(' AND ')}
           ORDER BY rl.created_at DESC`,
          vals,
        )
        if (exportFmt === 'csv') return csvResponse(rRows, 'watchline-requests')
        return NextResponse.json({ rows: rRows, exported_at: new Date().toISOString() })
      } else {
        const errWhere = [...where]
        if (severity) errWhere.push(`severity = $${vals.push(severity)}`)
        const { rows: eRows } = await pool.query(
          `SELECT ee.*, s.name AS school_name
           FROM error_events ee
           LEFT JOIN schools s ON s.id = ee.school_id
           WHERE ${qualifyDate(errWhere, 'ee').join(' AND ')}
           ORDER BY ee.created_at DESC`,
          vals,
        )
        if (exportFmt === 'csv') return csvResponse(eRows, 'watchline-errors')
        return NextResponse.json({ rows: eRows, exported_at: new Date().toISOString() })
      }
    }

    // ── Paginated rows ──
    let rows: unknown[] = []
    let total = 0

    if (type !== 'error') {
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM request_logs WHERE ${where.join(' AND ')}`, vals,
      )
      total = Number(countRes.rows[0].count)
      const { rows: r } = await pool.query(
        `SELECT rl.*, s.name AS school_name
         FROM request_logs rl
         LEFT JOIN schools s ON s.id = rl.school_id
         WHERE ${qualifyDate(where, 'rl').join(' AND ')}
         ORDER BY rl.created_at DESC
         LIMIT $${vals.push(PAGE_SIZE)} OFFSET $${vals.push(page * PAGE_SIZE)}`,
        vals,
      )
      rows = r
    } else {
      const errWhere = [...where]
      if (severity) errWhere.push(`severity = $${vals.push(severity)}`)
      const errVals = [...vals]
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM error_events WHERE ${errWhere.join(' AND ')}`, errVals,
      )
      total = Number(countRes.rows[0].count)
      const { rows: r } = await pool.query(
        `SELECT ee.*, s.name AS school_name
         FROM error_events ee
         LEFT JOIN schools s ON s.id = ee.school_id
         WHERE ${qualifyDate(errWhere, 'ee').join(' AND ')}
         ORDER BY ee.created_at DESC
         LIMIT $${errVals.push(PAGE_SIZE)} OFFSET $${errVals.push(page * PAGE_SIZE)}`,
        errVals,
      )
      rows = r
    }

    return NextResponse.json({ summary, top_routes: topRoutes, rows, total, page, page_size: PAGE_SIZE })
  } catch (err) {
    console.error('[watchline GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/platform/watchline ──────────────────────────────────────────
// Clears all rows from request_logs and error_events (platform admin only).
// Optional body: { before?: ISO string } — only deletes rows older than that date.
// Without `before`, deletes everything.
export async function DELETE(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({})) as { before?: string }
    const before = body.before || null

    const [r1, r2] = await Promise.all([
      before
        ? pool.query('DELETE FROM request_logs WHERE created_at < $1', [before])
        : pool.query('DELETE FROM request_logs'),
      before
        ? pool.query('DELETE FROM error_events WHERE created_at < $1', [before])
        : pool.query('DELETE FROM error_events'),
    ])
    return NextResponse.json({
      deleted: {
        request_logs: r1.rowCount,
        error_events: r2.rowCount,
      },
      cleared_at: new Date().toISOString(),
      cleared_by: `userId:${session.userId} (${session.role})`,
    })
  } catch (err) {
    console.error('[watchline DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function csvResponse(rows: Record<string, unknown>[], filename: string): NextResponse {
  if (rows.length === 0) {
    return new NextResponse('No data', {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}.csv"` },
    })
  }
  const keys = Object.keys(rows[0])
  const header = keys.join(',')
  const body = rows.map(r =>
    keys.map(k => {
      const v = r[k]
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s
    }).join(',')
  ).join('\n')
  return new NextResponse(`${header}\n${body}`, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  })
}
