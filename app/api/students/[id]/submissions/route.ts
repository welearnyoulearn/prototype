import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/students/[id]/submissions?school_id=&class_id=
// Batch-fetches all task submissions for a student in a class (fixes N+1 pattern)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id: student_id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const classFilter = class_id ? 'AND t.class_id = $3' : ''
  const queryParams: (string | number)[] = [student_id, school_id]
  if (class_id) queryParams.push(class_id)

  const { rows } = await pool.query(
    `SELECT
      ts.id AS submission_id,
      ts.task_id,
      ts.status AS submission_status,
      ts.score,
      ts.feedback,
      ts.resubmission_requested,
      ts.file_url,
      ts.file_name,
      ts.submitted_at,
      ts.reviewed_at,
      t.title AS task_title,
      t.subject,
      t.description,
      t.due_date,
      t.max_marks,
      t.status AS task_status,
      t.class_id,
      t.teacher_id,
      c.grade,
      c.section
     FROM task_submissions ts
     JOIN tasks t ON t.id = ts.task_id
     JOIN classes c ON c.id = t.class_id
     WHERE ts.student_id = $1
       AND t.school_id = $2
       ${classFilter}
     ORDER BY t.due_date DESC NULLS LAST, ts.submitted_at DESC`,
    queryParams
  )

  return NextResponse.json(rows)
}
