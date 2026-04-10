import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// AUTH DISABLED FOR TESTING — will be re-enabled when all features are complete

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows: [doubt] } = await pool.query(`
    SELECT d.*, s.name AS student_name, s.roll_number,
           c.grade, c.section, t.name AS answered_by_name, tk.title AS task_title
    FROM doubts d
    JOIN students s ON s.id = d.student_id
    JOIN classes c ON c.id = d.class_id
    LEFT JOIN teachers t ON t.id = d.answered_by
    LEFT JOIN tasks tk ON tk.id = d.task_id
    WHERE d.id = $1 AND d.school_id = $2
  `, [id, school_id])

  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })
  return NextResponse.json(doubt)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const body = await req.json()
  const { school_id, teacher_id, teacher_answer, status } = body

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })

  const newStatus = status || (teacher_answer ? 'in_progress' : doubt.status)
  const now = new Date().toISOString()

  const { rows: [updated] } = await pool.query(`
    UPDATE doubts SET
      teacher_answer = COALESCE($3, teacher_answer),
      answered_by = CASE WHEN $3 IS NOT NULL THEN $4 ELSE answered_by END,
      answered_at = CASE WHEN $3 IS NOT NULL AND answered_at IS NULL THEN $5 ELSE answered_at END,
      status = $6
    WHERE id = $1 AND school_id = $2
    RETURNING *
  `, [id, school_id, teacher_answer || null, teacher_id || null, now, newStatus])

  // Notify student when teacher answers
  if (teacher_answer && doubt.status === 'open') {
    await pool.query(`
      INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
      VALUES ($1, $2, 'doubt_answered', $3, $4, $5)
    `, [
      school_id, doubt.student_id,
      `Your doubt was answered — ${doubt.subject}`,
      `Your question "${doubt.question.slice(0, 60)}..." has been answered.`,
      JSON.stringify({ doubt_id: doubt.id }),
    ])
  }

  return NextResponse.json(updated)
}

// PATCH /api/doubts/[id] — toggle FAQ status (teacher only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const body = await req.json()
  const { school_id, teacher_id, is_class_faq } = body

  if (!school_id || !teacher_id) {
    return NextResponse.json({ error: 'school_id and teacher_id required' }, { status: 400 })
  }

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })

  const newFaqState = is_class_faq === true
  const { rows: [updated] } = await pool.query(
    `UPDATE doubts SET
       is_class_faq = $3,
       faq_set_by = CASE WHEN $3 = TRUE THEN $4 ELSE NULL END
     WHERE id = $1 AND school_id = $2
     RETURNING *`,
    [id, school_id, newFaqState, teacher_id]
  )

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  const student_id = req.nextUrl.searchParams.get('student_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (student_id && doubt.student_id !== parseInt(student_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await pool.query('DELETE FROM doubts WHERE id = $1', [id])
  return NextResponse.json({ message: 'Deleted' })
}
