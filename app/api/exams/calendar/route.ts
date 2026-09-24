import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireExamsAccess } from '@/lib/examsAuth'

export async function GET(req: NextRequest) {
  try {

    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const class_id = searchParams.get('class_id')
    const teacher_id = searchParams.get('teacher_id')
    const student_id = searchParams.get('student_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    // 'draft' no longer exists as a status (see the v2 lifecycle in
    // lib/examsAuth.ts's header comment) — kept as a param name for backward
    // compatibility with any existing caller, but now means "include a
    // not-yet-open ('scheduled') exam", which is the closest v2 equivalent.
    const includeUnopened = searchParams.get('include_draft') === 'true'

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const currentYear = new Date().getFullYear()
    const dateFrom = from || `${currentYear}-01-01`
    const dateTo = to || `${currentYear}-12-31`

    try {
      let whereClause = ''
      const vals: (string | number)[] = [actor.schoolId, dateFrom, dateTo]

      if (class_id) {
        vals.push(parseInt(class_id))
        whereClause = `e.class_id = $${vals.length} AND e.school_id = $1`
      } else if (teacher_id) {
        vals.push(parseInt(teacher_id))
        whereClause = `e.school_id = $1 AND (
          EXISTS (SELECT 1 FROM exam_subjects es WHERE es.exam_id = e.id AND es.teacher_id = $${vals.length})
          OR c.class_teacher_id = $${vals.length}
        )`
      } else if (student_id) {
        const { rows: [student] } = await pool.query(
          `SELECT s.grade, s.section FROM students s WHERE s.id = $1 AND s.school_id = $2`,
          [parseInt(student_id), actor.schoolId]
        )
        if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
        vals.push(student.grade, student.section)
        whereClause = `c.grade = $${vals.length - 1} AND c.section = $${vals.length} AND e.school_id = $1`
      } else {
        whereClause = `e.school_id = $1`
      }

      if (!includeUnopened) {
        whereClause += ` AND e.status != 'scheduled'`
      }

      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status,
          e.class_id,
          c.grade,
          c.section,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects,
          COALESCE(
            ARRAY_AGG(es.subject_name ORDER BY es.subject_name) FILTER (WHERE es.subject_name IS NOT NULL),
            '{}'
          ) AS subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE ${whereClause}
          AND (e.exam_date IS NULL OR e.exam_date BETWEEN $2 AND $3)
        GROUP BY e.id, c.grade, c.section
        ORDER BY e.exam_date ASC
      `, vals)

      return NextResponse.json(rows)
    } catch (err) {
      console.error('GET /api/exams/calendar error:', err)
      return NextResponse.json({ error: 'Failed to fetch exam calendar' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
