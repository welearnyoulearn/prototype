import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession, requireFeeAccess } from '@/lib/auth'
import { AnnouncementCreateSchema, normaliseAudience } from '@/lib/announcements'
import { todayIST } from '@/lib/istDate'

// Hard ceiling on rows per request so a noticeboard can never come back unbounded.
const MAX_LIMIT = 500

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it (Math.min/clamping keeps NaN, which Number.isInteger catches).
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

// GET /api/announcements?school_id=&audience=teachers|students|parents|all&limit=&offset=
// Returns active announcements filtered by audience.
// audience param: if provided, returns announcements targeted to 'all' OR that specific audience.
export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const school_id = req.nextUrl.searchParams.get('school_id')
    const audience  = req.nextUrl.searchParams.get('audience') // 'teachers' | 'students' | 'parents' | 'all' | null

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // The session used to be checked for existence and then thrown away, so any
    // logged-in user — including a student or parent — could pass another school's
    // id and read its entire noticeboard. Scope comes from the session; the param
    // is only allowed to agree with it.
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // India date: a notice that expires "today" stays up until midnight IST, not 05:30 the next morning
    const today = todayIST()

    // Build audience filter:
    // - No audience param → return everything (admin view)
    // - audience=X → return rows where target_audience='all' OR contains X in comma-separated list
    let audienceFilter = ''
    const params: (string | number)[] = [session.schoolId, today]

    if (audience && audience !== 'all') {
      audienceFilter = `AND (
        target_audience = 'all'
        OR target_audience = $3
        OR target_audience LIKE $3 || ',%'
        OR target_audience LIKE '%,' || $3
        OR target_audience LIKE '%,' || $3 || ',%'
      )`
      params.push(audience)
    }

    // Single table, no JOINs, so COUNT(*) over this same WHERE is exact.
    const where = `WHERE school_id = $1
        AND (expires_at IS NULL OR expires_at >= $2)
        ${audienceFilter}`

    // Pagination is opt-in — see the note in app/api/fees/ledger/route.ts. Without
    // limit/offset the response stays the plain unbounded array callers expect today.
    const paginated = req.nextUrl.searchParams.has('limit') || req.nextUrl.searchParams.has('offset')
    let pageClause = ''
    let limit = 0
    let offset = 0
    if (paginated) {
      limit = Math.min(parseCount(req.nextUrl.searchParams.get('limit'), MAX_LIMIT), MAX_LIMIT)
      offset = parseCount(req.nextUrl.searchParams.get('offset'), 0)
      if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
        return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
      }
      params.push(limit, offset)
      pageClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`
    }

    // priority bucket + created_at is not a total order (bulk-created notices share
    // a timestamp), so id breaks the tie and keeps paging stable.
    const { rows } = await pool.query(`
      SELECT id, title, content, announcement_type, target_audience, priority,
             created_by_name, expires_at::text, created_at
      FROM announcements
      ${where}
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        created_at DESC,
        id DESC
      ${pageClause}
    `, params)

    if (!paginated) return NextResponse.json(rows)

    // Only paginated callers pay for the count.
    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM announcements ${where}`,
      params.slice(0, params.length - 2)
    )
    return NextResponse.json({ data: rows, limit, offset, total })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/announcements
// Body: { school_id, title, content, announcement_type, target_audience, priority, expires_at }
// target_audience: 'all' | comma-separated e.g. 'teachers,students' | 'teachers' | 'students' | 'parents'
// School admin / principal / vice principal of THAT school (or a platform admin) only.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const access = await requireFeeAccess(body?.school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = AnnouncementCreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    const d = parsed.data

    // Author comes from the signed-in user, never from the request
    const { rows: [author] } = await pool.query<{ full_name: string | null }>(`SELECT full_name FROM user_profiles WHERE user_id = $1`, [access.userId])
    const createdBy = author?.full_name?.trim() || access.actor

    const { rows: [row] } = await pool.query(`
      INSERT INTO announcements
        (school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at::text, created_at
    `, [access.schoolId, d.title, d.content, d.announcement_type, normaliseAudience(d.target_audience), d.priority, createdBy, d.expires_at || null])

    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
