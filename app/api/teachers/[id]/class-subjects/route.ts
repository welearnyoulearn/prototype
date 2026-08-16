import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession, requireFeeAccess } from '@/lib/auth'

// GET /api/teachers/[id]/class-subjects
//
// The single source of truth for what a teacher is allowed to see in the
// Syllabus tab of the teacher portal: every (class, subject) pair they were
// explicitly assigned via Class Management's class_subjects table — not the
// looser "any class you have a timetable slot in" logic used previously.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Either the teacher looking up their own assignments, or their own
    // school's admin (Class Management needs the same data to show who's
    // assigned what) — never another teacher or a different school.
    const teacherSession = await getTeacherSession()
    const isSelf = teacherSession?.teacherId === Number(id)
    if (!isSelf) {
      const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [id])
      if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const access = await requireFeeAccess(ownerRes.rows[0].school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.class_id, c.grade, c.section
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       WHERE cs.teacher_id = $1
       ORDER BY c.grade, c.section, cs.subject_name`,
      [id]
    )
    return NextResponse.json(result.rows)
  } catch (err: unknown) {
    console.error('[API] teachers/[id]/class-subjects GET', err)
    return NextResponse.json({ error: 'Failed to fetch class subjects' }, { status: 500 })
  }
}
