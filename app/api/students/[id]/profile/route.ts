import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureDB } from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'
import { buildStudentProfile } from '@/lib/studentProfile'

// GET /api/students/:id/profile[?year=<academic_year_id>]
// The school admin's complete picture of one student (attendance, marks, fees, engagement) for one academic
// year. School admin / principal / vice principal only, and only students of their own school.

const params = z.object({ id: z.coerce.number().int().positive() })
const query = z.object({ year: z.string().regex(/^\d{1,9}$/).optional() })

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureDB()
    const admin = await requireSchoolAdmin()
    if (!admin?.schoolId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = params.safeParse(await ctx.params)
    const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!p.success || !q.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const profile = await buildStudentProfile(admin.schoolId, p.data.id, q.data.year ?? null)
    if (!profile) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(profile, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[students/profile]', err)
    return NextResponse.json({ error: 'Failed to load the student profile' }, { status: 500 })
  }
}
