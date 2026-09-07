import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

const MAX_LIMIT = 200

function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

// GET /api/feedback/submissions?school_id=&role=&limit=&offset=
// Each row carries its ratings as a nested array (json_agg) so the admin
// list can render "Transport 😭, Food 🤩" per submission without N+1 queries.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const school_id = sp.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = sp.get('role')
    const params: (string | number)[] = [access.schoolId]
    let roleFilter = ''
    if (role) {
      roleFilter = `AND s.role = $${params.length + 1}`
      params.push(role)
    }

    const limit = Math.min(parseCount(sp.get('limit'), 50), MAX_LIMIT)
    const offset = parseCount(sp.get('offset'), 0)
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
      return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
    }
    params.push(limit, offset)

    // The page query and the total count don't depend on each other — run
    // them concurrently instead of paying for two sequential round-trips.
    const [listRes, countRes] = await Promise.all([
      pool.query(`
        SELECT s.id, s.role, s.is_anonymous, s.submitter_name, s.submitter_phone,
               s.quick_pick_tags, s.free_text, (s.voice_object_key IS NOT NULL) AS has_voice, s.created_at,
               COALESCE(
                 json_agg(
                   json_build_object('category_key', r.category_key, 'category_label', r.category_label,
                                      'rating', r.rating, 'priority', r.priority, 'status', r.status)
                   ORDER BY r.id
                 ) FILTER (WHERE r.id IS NOT NULL), '[]'
               ) AS ratings
        FROM feedback_submissions s
        LEFT JOIN feedback_submission_ratings r ON r.submission_id = s.id
        WHERE s.school_id = $1 ${roleFilter}
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM feedback_submissions s WHERE s.school_id = $1 ${roleFilter}`,
        params.slice(0, params.length - 2)
      ),
    ])

    return NextResponse.json({ data: listRes.rows, limit, offset, total: countRes.rows[0].total })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
