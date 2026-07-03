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
  const toDate    = p.get('to')   || new Date().toISOString()
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
    const where: string[] = ['created_at BETWEEN $1 AND $2']
    const vals: unknown[] = [fromDate, toDate]
    if (schoolId) where.push(`school_id = $${vals.push(schoolId)}`)

    if (exportFmt) {
      // Full export — no pagination, no limit
      if (type !== 'error') {
        const { rows: rRows } = await pool.query(
          `SELECT rl.*, s.name AS school_name
           FROM request_logs rl
           LEFT JOIN schools s ON s.id = rl.school_id
           WHERE ${where.join(' AND ')}
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
           WHERE ${errWhere.join(' AND ')}
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
         WHERE ${where.join(' AND ')}
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
         WHERE ${errWhere.join(' AND ')}
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
