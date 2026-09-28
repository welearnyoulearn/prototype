import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackCategoryCreateSchema } from '@/lib/validation/feedback'

// GET /api/feedback/categories?school_id=&role=
// Each row also carries rating_count / avg_rating / open_issues / last_rated_at.
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
    if (role) { params.push(role); roleFilter = `AND c.role = $${params.length}` }

    // Live usage per category (archived submissions excluded) so the admin
    // can see which categories people actually rate and where issues are.
    const { rows } = await pool.query(
      `SELECT c.*,
              COALESCE(st.rating_count, 0)::int AS rating_count,
              st.avg_rating::float AS avg_rating,
              COALESCE(st.open_issues, 0)::int AS open_issues,
              st.last_rated_at
       FROM feedback_categories c
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS rating_count, AVG(r.rating) AS avg_rating,
                COUNT(*) FILTER (WHERE r.priority IS NOT NULL AND r.status = 'open') AS open_issues,
                MAX(r.created_at) AS last_rated_at
         FROM feedback_submission_ratings r
         JOIN feedback_submissions s ON s.id = r.submission_id AND s.archived_at IS NULL
         WHERE r.category_id = c.id
       ) st ON TRUE
       WHERE c.school_id = $1 ${roleFilter}
       ORDER BY c.role, c.sort_order, c.id`,
      params
    )
    return NextResponse.json(rows)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/feedback/categories
// Body: { school_id, role, key, label, icon?, department? }
export async function POST(req: NextRequest) {
  try {
    const parsed = feedbackCategoryCreateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    const body = parsed.data

    const access = await requireFeeAccess(body.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { rows: [{ next_sort }] } = await pool.query<{ next_sort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM feedback_categories WHERE school_id = $1 AND role = $2`,
      [access.schoolId, body.role]
    )

    const { rows: [row] } = await pool.query(
      `INSERT INTO feedback_categories (school_id, role, key, label, icon, department, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [access.schoolId, body.role, body.key, body.label, body.icon || null, body.department || null, next_sort]
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A category with this key already exists for this role' }, { status: 409 })
    }
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
