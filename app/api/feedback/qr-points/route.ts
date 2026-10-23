import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { mintFeedbackCode } from '@/lib/feedback-public-access'
import { listQrPoints, validateQrPointCategories } from '@/lib/feedback-qr-points'
import { feedbackQrPointCreateSchema } from '@/lib/validation/feedback'

// GET /api/feedback/qr-points?school_id= — the school's event/place QR
// points, each with its own response count, average rating and open issues.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    return NextResponse.json(await listQrPoints(pool, access.schoolId))
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/feedback/qr-points — Body: { school_id, kind, title, venue?,
// event_date?, details?, form_type, roles, category_ids?, poster_quote?, closes_on? }
export async function POST(req: NextRequest) {
  try {
    const parsed = feedbackQrPointCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const body = parsed.data

    const access = await requireFeeAccess(body.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const categoryIds = body.form_type === 'rating' ? [...new Set(body.category_ids ?? [])] : []
    const scopeError = await validateQrPointCategories(pool, access.schoolId, body.form_type, body.roles, categoryIds)
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })

    const code = await mintFeedbackCode(pool)
    const { rows: [point] } = await pool.query(
      `INSERT INTO feedback_qr_points
         (school_id, code, kind, title, venue, event_date, details, form_type, roles, category_ids, poster_quote, closes_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        access.schoolId, code, body.kind, body.title, body.venue || null, body.event_date || null,
        body.details || null, body.form_type, [...new Set(body.roles)], categoryIds,
        body.poster_quote || null, body.closes_on || null,
      ]
    )

    return NextResponse.json({ id: point.id }, { status: 201 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
