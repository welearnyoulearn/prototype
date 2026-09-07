import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess } from '@/lib/examsAuth'

// GET /api/exams?school_id=&class_id=&teacher_id= (teacher_id = get exams where this teacher has subjects)
//
// Note: exam creation moved entirely to POST /api/exams/schedule (admin
// creates, class teacher no longer creates) — there is no POST here in v2.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const class_id = searchParams.get('class_id')
    const teacher_id = searchParams.get('teacher_id') // subject teacher lookup

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let rows
    if (class_id && teacher_id) {
      // Subject teacher within a specific class: return exams with their subject details.
      // Excludes 'released' — the same "don't clutter the active worklist with
      // finished exams" rule the old 'published' exclusion had.
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_at, e.released_at,
          c.grade, c.section,
          es.id AS exam_subject_id,
          es.subject_name,
          es.max_marks,
          es.status AS subject_status,
          COUNT(DISTINCT all_es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN all_es.status = 'submitted' THEN all_es.id END)::int AS submitted_subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN exam_subjects es ON es.exam_id = e.id AND es.teacher_id = $3
        LEFT JOIN exam_subjects all_es ON all_es.exam_id = e.id
        WHERE e.class_id = $1 AND e.school_id = $2 AND e.status != 'released'
        GROUP BY e.id, c.grade, c.section, es.id, es.subject_name, es.max_marks, es.status
        ORDER BY e.exam_date ASC NULLS LAST, e.created_at DESC
      `, [parseInt(class_id), parseInt(school_id!), parseInt(teacher_id)])
      rows = r
    } else if (teacher_id && !class_id) {
      // Subject teacher: get all their pending exams across all classes, entry currently open.
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_at, e.released_at,
          c.grade, c.section,
          es.id AS exam_subject_id,
          es.subject_name,
          es.max_marks,
          es.status AS subject_status
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN exam_subjects es ON es.exam_id = e.id AND es.teacher_id = $2
        WHERE e.school_id = $1 AND e.status = 'collecting'
        ORDER BY e.exam_date ASC NULLS LAST, e.created_at DESC
      `, [parseInt(school_id!), parseInt(teacher_id)])
      rows = r
    } else if (class_id) {
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_at, e.released_at,
          c.grade, c.section, c.class_teacher_id,
          COALESCE(t.name, u.full_name, 'School Admin') AS created_by_name,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.teacher_id IS NOT NULL THEN es.id END)::int AS assigned_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN teachers t ON t.id = e.created_by
        LEFT JOIN users u ON u.id = e.created_by_admin_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE e.class_id = $1 AND e.school_id = $2
        GROUP BY e.id, c.grade, c.section, c.class_teacher_id, t.name, u.full_name
        ORDER BY e.created_at DESC
      `, [parseInt(class_id), parseInt(school_id!)])
      rows = r
    } else {
      // School-wide: all exams across all classes (admin view)
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_at, e.released_at, e.exam_group_id,
          c.grade, c.section,
          COALESCE(t.name, u.full_name, 'School Admin') AS created_by_name,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN teachers t ON t.id = e.created_by
        LEFT JOIN users u ON u.id = e.created_by_admin_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE e.school_id = $1
        GROUP BY e.id, c.grade, c.section, t.name, u.full_name
        ORDER BY e.created_at DESC
      `, [parseInt(school_id!)])
      rows = r
    }

    return NextResponse.json(rows)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
