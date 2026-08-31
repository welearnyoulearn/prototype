import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { FEEDBACK_CATEGORY_VALUES } from '@/lib/feedbackCategories'

// Hard ceiling on rows per request so the list can never come back unbounded.
const MAX_LIMIT = 500

const ListQuerySchema = z.object({
  school_id: z.coerce.number().int().positive(),
  category: z.enum(FEEDBACK_CATEGORY_VALUES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it.
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = ListQuerySchema.safeParse({
    school_id: sp.get('school_id'),
    category: sp.get('category') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { school_id, category, from, to } = parsed.data

  // Generic school-admin tenant + role gate (reused from fees, not fee-specific):
  // platform_admin may target any school; school_admin/principal/vice_principal
  // are pinned to their own school_id.
  const access = await requireFeeAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const conditions: string[] = ['school_id = $1']
  const values: (string | number)[] = [access.schoolId]
  if (category) { values.push(category); conditions.push(`category = $${values.length}`) }
  if (from) { values.push(from); conditions.push(`created_at::date >= $${values.length}`) }
  if (to) { values.push(to); conditions.push(`created_at::date <= $${values.length}`) }
  const where = `WHERE ${conditions.join(' AND ')}`

  // Pagination is strictly opt-in — presence of limit/offset triggers it.
  const paginated = sp.has('limit') || sp.has('offset')
  let pageClause = ''
  let limit = 0
  let offset = 0
  if (paginated) {
    limit = Math.min(parseCount(sp.get('limit'), MAX_LIMIT), MAX_LIMIT)
    offset = parseCount(sp.get('offset'), 0)
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 0 || offset < 0) {
      return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
    }
    values.push(limit, offset)
    pageClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`
  }

  try {
    const result = await pool.query(
      `SELECT id, category, message, name, phone, email, rating, images, created_at FROM school_feedback ${where}
       ORDER BY created_at DESC ${pageClause}`,
      values
    )
    if (!paginated) return NextResponse.json(result.rows)

    // Only paginated callers pay for the count.
    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM school_feedback ${where}`,
      values.slice(0, values.length - 2)
    )
    return NextResponse.json({ data: result.rows, limit, offset, total })
  } catch (err) {
    console.error('GET /api/feedback error:', err)
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
  }
}
