import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/issues?school_id=&status=&priority=&department=
// An "issue" is a single low-rated category-rating (priority IS NOT NULL),
// not a whole submission — one submission can produce zero, one, or several
// issues if it rated multiple categories poorly.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const school_id = sp.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params: (string | number)[] = [access.schoolId]
    let filters = ''
    for (const [param, col] of [['status', 'r.status'], ['priority', 'r.priority'], ['department', 'r.department']] as const) {
      const value = sp.get(param)
      if (value) { params.push(value); filters += ` AND ${col} = $${params.length}` }
    }

    const { rows } = await pool.query(`
      SELECT r.id, r.submission_id, r.category_key, r.category_label, r.department,
             r.rating, r.priority, r.status, r.created_at, r.updated_at,
             s.role, s.is_anonymous, s.submitter_name, s.free_text
      FROM feedback_submission_ratings r
      JOIN feedback_submissions s ON s.id = r.submission_id
      WHERE r.school_id = $1 AND r.priority IS NOT NULL ${filters}
      ORDER BY (r.priority = 'high') DESC, r.created_at DESC
    `, params)

    return NextResponse.json(rows)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
