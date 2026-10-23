import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, requireExamsAdmin } from '@/lib/examsAuth'

// GET /api/exams/[id]?school_id= — full exam detail with subjects + marks summary
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const school_id = req.nextUrl.searchParams.get('school_id')
    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    // LEFT JOIN teachers — created_by is nullable (admin-created exams have
    // no teacher creator), and an inner JOIN here previously made every
    // admin-created exam 404 for everyone, permanently. created_by_name
    // falls back to the admin's own users.full_name, then a generic label.
    const { rows: [exam] } = await pool.query(`
      SELECT e.*,
        TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
        c.grade, c.section, c.class_teacher_id,
        COALESCE(t.name, u.full_name, 'School Admin') AS created_by_name
      FROM exam_records e
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN teachers t ON t.id = e.created_by
      LEFT JOIN users u ON u.id = e.created_by_admin_id
      WHERE e.id = $1 AND e.school_id = $2
    `, [id, actor.schoolId])
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const { rows: subjects } = await pool.query(`
      SELECT es.*, t.name AS teacher_name_current
      FROM exam_subjects es
      LEFT JOIN teachers t ON t.id = es.teacher_id
      WHERE es.exam_id = $1
      ORDER BY es.subject_name
    `, [id])

    const { rows: subjectStats } = await pool.query(`
      SELECT
        em.subject_name,
        COUNT(DISTINCT em.student_id)::int AS entries,
        ROUND(AVG(em.marks_obtained) FILTER (WHERE NOT em.is_absent), 1) AS avg_marks,
        COUNT(DISTINCT CASE WHEN em.is_absent THEN em.student_id END)::int AS absent_count
      FROM exam_marks em
      WHERE em.exam_id = $1
      GROUP BY em.subject_name
    `, [id])

    const statsMap: Record<string, { entries: number; avg_marks: number | null; absent_count: number }> = {}
    subjectStats.forEach(s => { statsMap[s.subject_name] = s })

    return NextResponse.json({
      ...exam,
      subjects: subjects.map(s => ({
        ...s,
        teacher_name: s.teacher_name_current || s.teacher_name,
        stats: statsMap[s.subject_name] ?? null,
      })),
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/exams/[id] — edit exam details. Admin-only: this is the "school
// admin who created the exam can edit its details" rule from the v2 flow —
// once an exam exists, only admin staff (not the class/subject teachers)
// change its name/date/type/passing_pct. Blocked once teacher review or
// release has happened, matching the old "no editing after publish" rule
// extended to the new intermediate stage too.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id } = await params
    const body = await req.json()
    const { school_id, exam_name, exam_type, exam_date, passing_pct } = body

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'Cannot edit an exam that has already been reviewed or released' }, { status: 400 })
    }
    if (exam_type && !['unit_test', 'mid_term', 'final_exam', 'practical'].includes(exam_type)) {
      return NextResponse.json({ error: 'Invalid exam_type' }, { status: 400 })
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE exam_records SET
        exam_name = COALESCE($3, exam_name),
        exam_type = COALESCE($4, exam_type),
        exam_date = COALESCE($5, exam_date),
        passing_pct = COALESCE($6, passing_pct),
        updated_at = NOW()
      WHERE id = $1 AND school_id = $2
      RETURNING *, TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date
    `, [id, actor.schoolId, exam_name || null, exam_type || null, exam_date || null, passing_pct ?? null])

    return NextResponse.json(updated)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/exams/[id] — admin-only, same reasoning as PUT.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'Cannot delete an exam that has already been reviewed or released' }, { status: 400 })
    }

    await pool.query('DELETE FROM exam_records WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
