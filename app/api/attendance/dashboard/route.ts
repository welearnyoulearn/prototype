import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getStaffActor } from '@/lib/attendanceAuth'
import { getClassForSchool } from '@/lib/attendance'
import { buildClassDashboard, buildSchoolDashboard, findStudents, rangeFor } from '@/lib/attendanceDashboard'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/attendance/dashboard — the numbers behind the admin and class-teacher dashboards.
//   ?scope=school&range=week|month|year[&month=YYYY-MM]     school admin only
//   ?scope=class&class_id=N&range=…                          school admin, or THAT class's class teacher
//   ?scope=my-classes                                        classes this person may open a dashboard for
//   ?scope=find&q=text                                       school admin: find a student by name / roll number
// Subject teachers (who are not a class's class teacher) get nothing here by design.
// Identity and school come from the login, never from the request.

const query = z.object({
  scope: z.enum(['school', 'class', 'my-classes', 'find']),
  range: z.enum(['week', 'month', 'year']).default('month'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  class_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(2).max(60).optional(),
})

const json = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const actor = await getStaffActor()
    if (!actor) return json('Unauthorized', 401)

    const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return json('Invalid request', 400)
    const { scope, range: rangeKey, month, class_id: classId, q } = parsed.data
    const schoolId = actor.schoolId
    const isAdmin = actor.kind === 'admin'

    if (scope === 'my-classes') {
      const { rows } = await pool.query(
        isAdmin
          ? `SELECT c.id, c.grade, c.section FROM classes c WHERE c.school_id = $1 AND c.deleted_at IS NULL
             ORDER BY ${gradeOrderSql('c.grade')}, c.section`
          : `SELECT c.id, c.grade, c.section FROM classes c
             WHERE c.school_id = $1 AND c.deleted_at IS NULL AND c.class_teacher_id = $2
             ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
        isAdmin ? [schoolId] : [schoolId, actor.teacherId]
      )
      return NextResponse.json({ classes: rows })
    }

    if (scope === 'school') {
      if (!isAdmin) return json('Only the school admin can see the school dashboard.', 403)
      return NextResponse.json(await buildSchoolDashboard(schoolId, await rangeFor(schoolId, rangeKey, month ?? null)))
    }

    if (scope === 'find') {
      if (!isAdmin) return json('Only the school admin can search students.', 403)
      if (!q) return NextResponse.json({ students: [] })
      return NextResponse.json({ students: await findStudents(schoolId, q) })
    }

    // scope === 'class'
    if (!classId) return json('class_id required', 400)
    const cls = await getClassForSchool(schoolId, classId)
    if (!cls) return json('Class not found', 404)
    if (!isAdmin) {
      const { rows: [own] } = await pool.query(
        `SELECT 1 FROM classes WHERE id = $1 AND school_id = $2 AND class_teacher_id = $3`,
        [classId, schoolId, actor.teacherId]
      )
      if (!own) return json('Only the class teacher can open this class dashboard.', 403)
    }
    return NextResponse.json(await buildClassDashboard(schoolId, cls, await rangeFor(schoolId, rangeKey, month ?? null)))
  } catch (err) {
    console.error('[attendance/dashboard]', err)
    return json('Failed to load the dashboard', 500)
  }
}
