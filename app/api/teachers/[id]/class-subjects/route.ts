import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getPlatformSession, getSession, getTeacherSession, requireFeeAccess } from '@/lib/auth'

// GET /api/teachers/[id]/class-subjects
//
// The single source of truth for what a teacher is allowed to see in the
// Syllabus tab of the teacher portal: every (class, subject) pair they were
// explicitly assigned via Class Management's class_subjects table — not the
// looser heuristic used previously.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const teacherId = Number(id)
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return NextResponse.json({ error: 'Invalid teacher ID' }, { status: 400 })
    }

    // Either the teacher looking up their own assignments, or their own
    // school's admin (Class Management needs the same data to show who's
    // assigned what) — never another teacher or a different school.
    const teacherSession = await getTeacherSession()
    const isSelf = teacherSession?.teacherId === teacherId
    if (teacherSession && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!isSelf) {
      // Authenticate before looking up the target so anonymous callers cannot
      // enumerate valid teacher IDs from the 403/404 distinction.
      const platform = await getPlatformSession()
      const staff = platform ? null : await getSession()
      if (!platform && !staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [teacherId])
      if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const access = await requireFeeAccess(ownerRes.rows[0].school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.class_id, c.grade, c.section
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       WHERE cs.teacher_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.grade, c.section, cs.subject_name`,
      [teacherId]
    )
    return NextResponse.json(result.rows)
  } catch (err: unknown) {
    console.error('[API] teachers/[id]/class-subjects GET', err)
    return NextResponse.json({ error: 'Failed to fetch class subjects' }, { status: 500 })
  }
}
