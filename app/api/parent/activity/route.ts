import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/parent/activity?school_id=X&student_id=Y&days=7
// Parent supervision: what has my child been doing in the student portal?
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id  = p.get('school_id')
  const student_id = p.get('student_id')
  const days       = parseInt(p.get('days') || '7')
  if (!school_id || !student_id) return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })

  try {
    const { rows: activity } = await pool.query(
      `SELECT a.id, a.action_type, a.action_detail, a.created_at,
              s.started_at AS session_start
       FROM student_portal_activity a
       LEFT JOIN student_portal_sessions s ON s.id = a.session_id
       WHERE a.school_id = $1 AND a.student_id = $2
         AND a.created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [school_id, student_id]
    )

    const { rows: sessions } = await pool.query(
      `SELECT id, started_at, ended_at, duration_minutes
       FROM student_portal_sessions
       WHERE school_id = $1 AND student_id = $2
         AND started_at >= NOW() - INTERVAL '${days} days'
       ORDER BY started_at DESC
       LIMIT 20`,
      [school_id, student_id]
    )

    const totalSessions       = sessions.length
    const totalMinutes        = sessions.reduce((s, r) => s + (r.duration_minutes || 0), 0)
    const lastSeen            = activity[0]?.created_at || null
    const actionTypeCounts: Record<string, number> = {}
    for (const a of activity) {
      actionTypeCounts[a.action_type] = (actionTypeCounts[a.action_type] || 0) + 1
    }

    return NextResponse.json({
      activity,
      sessions,
      summary: { totalSessions, totalMinutes, lastSeen, actionTypeCounts }
    })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/parent/activity — log student portal activity (called from student portal)
export async function POST(req: NextRequest) {
  try {
    const { school_id, student_id, session_id, action_type, action_detail } = await req.json()
    if (!school_id || !student_id || !action_type) {
      return NextResponse.json({ error: 'school_id, student_id, action_type required' }, { status: 400 })
    }
    await pool.query(
      `INSERT INTO student_portal_activity (school_id, student_id, session_id, action_type, action_detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [school_id, student_id, session_id || null, action_type, action_detail || null]
    )
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
