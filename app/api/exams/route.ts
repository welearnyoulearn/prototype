import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/exams?school_id=&class_id=&teacher_id= (teacher_id = get exams where this teacher has subjects)
export async function GET(req: NextRequest) {
  await ensureDB()
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  const teacher_id = searchParams.get('teacher_id') // subject teacher lookup

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    let rows
    if (class_id && teacher_id) {
      // Subject teacher within a specific class: return exams with their subject details
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_by, e.created_at, e.published_at,
          c.grade, c.section,
          es.subject_name,
          es.max_marks,
          es.status AS subject_status,
          COUNT(DISTINCT all_es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN all_es.status = 'submitted' THEN all_es.id END)::int AS submitted_subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN exam_subjects es ON es.exam_id = e.id AND es.teacher_id = $3
        LEFT JOIN exam_subjects all_es ON all_es.exam_id = e.id
        WHERE e.class_id = $1 AND e.school_id = $2 AND e.status != 'published'
        GROUP BY e.id, c.grade, c.section, es.subject_name, es.max_marks, es.status
        ORDER BY e.exam_date ASC NULLS LAST, e.created_at DESC
      `, [parseInt(class_id), parseInt(school_id), parseInt(teacher_id)])
      rows = r
    } else if (teacher_id && !class_id) {
      // Subject teacher: get all their pending exams across all classes
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_by, e.created_at, e.published_at,
          c.grade, c.section,
          es.subject_name,
          es.max_marks,
          es.status AS subject_status
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN exam_subjects es ON es.exam_id = e.id AND es.teacher_id = $2
        WHERE e.school_id = $1 AND e.status = 'collecting'
        ORDER BY e.exam_date ASC NULLS LAST, e.created_at DESC
      `, [parseInt(school_id), parseInt(teacher_id)])
      rows = r
    } else if (class_id) {
      const { rows: r } = await pool.query(`
        SELECT
          e.id, e.exam_name, e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status, e.passing_pct,
          e.class_id, e.created_by, e.created_at, e.published_at,
          c.grade, c.section,
          COALESCE(t.name, 'School Admin') AS created_by_name,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN teachers t ON t.id = e.created_by
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE e.class_id = $1 AND e.school_id = $2
        GROUP BY e.id, c.grade, c.section, t.name
        ORDER BY e.created_at DESC
      `, [parseInt(class_id), parseInt(school_id)])
      rows = r
    } else {
      return NextResponse.json({ error: 'class_id or teacher_id required' }, { status: 400 })
    }

    return NextResponse.json(rows)
  } catch (err) {
    console.error('GET /api/exams error:', err)
    return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 })
  }
}

// POST /api/exams — class teacher creates an exam
export async function POST(req: NextRequest) {
  await ensureDB()
  const body = await req.json()
  const { school_id, class_id, teacher_id, exam_name, exam_type = 'unit_test', exam_date, passing_pct = 35 } = body

  if (!school_id || !class_id || !teacher_id || !exam_name?.trim()) {
    return NextResponse.json({ error: 'school_id, class_id, teacher_id, exam_name required' }, { status: 400 })
  }
  if (!['unit_test', 'mid_term', 'final_exam', 'practical'].includes(exam_type)) {
    return NextResponse.json({ error: 'Invalid exam_type' }, { status: 400 })
  }

  // Verify this teacher is the class teacher for this class
  const { rows: [cls] } = await pool.query(
    'SELECT id, class_teacher_id FROM classes WHERE id = $1 AND school_id = $2',
    [class_id, school_id]
  )
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.class_teacher_id !== parseInt(teacher_id)) {
    return NextResponse.json({ error: 'Only the class teacher can create exams' }, { status: 403 })
  }

  try {
    const { rows: [exam] } = await pool.query(`
      INSERT INTO exam_records (school_id, class_id, created_by, exam_name, exam_type, exam_date, passing_pct, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING *,
        TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date
    `, [school_id, class_id, teacher_id, exam_name.trim(), exam_type, exam_date || null, passing_pct])

    return NextResponse.json(exam, { status: 201 })
  } catch (err) {
    console.error('POST /api/exams error:', err)
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 500 })
  }
}
