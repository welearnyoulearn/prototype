import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'
import { normalizeStaffPhone } from '@/lib/staffValidation'
import { invalidateCache } from '@/lib/responseCache'

// PUT /api/teacher/profile  { phone?, qualification? }
// A teacher updates their own contact details (#504). The teacher comes from the session; name, email
// (the login), subject, grades, dates and status stay with the school admin (PUT /api/teachers/{id}).
const OWN_FIELDS = new Set(['phone', 'qualification'])
const json = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function PUT(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getTeacherSession()
    if (!session) return json('Unauthenticated', 401)

    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json('Request body must be valid JSON', 400)
    const input = body as Record<string, unknown>
    const keys = Object.keys(input)
    if (keys.some(k => !OWN_FIELDS.has(k))) return json('Only your phone number and qualification can be changed here', 400)
    if (keys.length === 0) return json('No changes supplied', 400)
    if (keys.some(k => typeof input[k] !== 'string')) return json('Values must be text', 400)

    let phone: string | null = null
    if ('phone' in input) {
      const parsed = normalizeStaffPhone(input.phone)
      if (parsed.error) return json(parsed.error, 422)
      phone = parsed.phone
      const { rows: [other] } = await pool.query(
        `SELECT 1 AS x FROM teachers WHERE school_id = $1 AND phone = $2 AND id <> $3 AND removed_at IS NULL LIMIT 1`,
        [session.schoolId, phone, session.teacherId])
      // No name here: one teacher has no need to learn whose number it is.
      if (other) return json('This phone number is already used by another staff member', 409)
    }
    const qualification = 'qualification' in input ? String(input.qualification).trim() : null
    if (qualification !== null && qualification.length > 200) return json('Qualification must be 200 characters or fewer', 422)

    const { rows: [teacher] } = await pool.query(
      `UPDATE teachers
       SET phone = COALESCE($3, phone),
           qualification = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE qualification END
       WHERE id = $1 AND school_id = $2
       RETURNING phone, qualification`,
      [session.teacherId, session.schoolId, phone, qualification !== null, qualification])
    if (!teacher) return json('Teacher not found', 404)
    invalidateCache(`teachers:${session.schoolId}:all`)
    invalidateCache(`teachers:${session.schoolId}:teaching`)
    invalidateCache(`teachers:${session.schoolId}:non_teaching`)
    return NextResponse.json(teacher)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return json('This phone number is already used by another staff member', 409)
    console.error('[teacher/profile]', err)
    return json('Internal server error', 500)
  }
}
