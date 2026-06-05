import { NextRequest, NextResponse } from 'next/server'
import { getAnySession } from '@/lib/auth'
import pool, { ensureDB } from '@/lib/db'

// GET /api/exams/[id]?school_id= — full exam detail with subjects + marks summary
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      const { rows: [exam] } = await pool.query(`
        SELECT e.*,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          c.grade, c.section,
          t.name AS created_by_name
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN teachers t ON t.id = e.created_by
        WHERE e.id = $1 AND e.school_id = $2
      `, [id, school_id])
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

      // Subjects with teacher info
      const { rows: subjects } = await pool.query(`
        SELECT es.*, t.name AS teacher_name_current
        FROM exam_subjects es
        LEFT JOIN teachers t ON t.id = es.teacher_id
        WHERE es.exam_id = $1
        ORDER BY es.subject_name
      `, [id])

      // Per-subject stats (only for published or collecting with some marks)
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
    } catch (err) {
      console.error('GET /api/exams/[id] error:', err)
      return NextResponse.json({ error: 'Failed to fetch exam' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/exams/[id] — update exam details (draft only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id } = await params
    const body = await req.json()
    const { school_id, teacher_id, exam_name, exam_type, exam_date, passing_pct } = body
    if (!school_id || !teacher_id) return NextResponse.json({ error: 'school_id and teacher_id required' }, { status: 400 })

    try {
      const { rows: [exam] } = await pool.query(
        'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [id, school_id]
      )
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      if (exam.status === 'published') return NextResponse.json({ error: 'Cannot edit published exam' }, { status: 400 })
      if (exam.created_by !== parseInt(teacher_id)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

      const { rows: [updated] } = await pool.query(`
        UPDATE exam_records SET
          exam_name = COALESCE($3, exam_name),
          exam_type = COALESCE($4, exam_type),
          exam_date = COALESCE($5, exam_date),
          passing_pct = COALESCE($6, passing_pct),
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING *, TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date
      `, [id, school_id, exam_name || null, exam_type || null, exam_date || null, passing_pct ?? null])

      return NextResponse.json(updated)
    } catch (err) {
      console.error('PUT /api/exams/[id] error:', err)
      return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/exams/[id] — delete exam (draft only, class teacher only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const teacher_id = req.nextUrl.searchParams.get('teacher_id')
    if (!school_id || !teacher_id) return NextResponse.json({ error: 'school_id and teacher_id required' }, { status: 400 })

    try {
      const { rows: [exam] } = await pool.query(
        'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [id, school_id]
      )
      if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (exam.status === 'published') return NextResponse.json({ error: 'Cannot delete published exam' }, { status: 400 })
      if (exam.created_by !== parseInt(teacher_id)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

      await pool.query('DELETE FROM exam_records WHERE id = $1', [id])
      return NextResponse.json({ success: true })
    } catch (err) {
      console.error('DELETE /api/exams/[id] error:', err)
      return NextResponse.json({ error: 'Failed to delete exam' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}