import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { awardPoints } from '@/lib/rewards'
import { getAnySession } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: doubt_id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [doubt_id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })

  const { rows } = await pool.query(
    `SELECT * FROM doubt_messages WHERE doubt_id = $1 ORDER BY created_at ASC`,
    [doubt_id]
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: doubt_id } = await params
  const body = await req.json()
  const { school_id, sender_type, sender_id, sender_name, message, is_final_answer = false } = body

  if (!school_id || !sender_type || !sender_id || !sender_name || !message?.trim()) {
    return NextResponse.json({ error: 'school_id, sender_type, sender_id, sender_name, message required' }, { status: 400 })
  }
  if (!['student', 'teacher'].includes(sender_type)) {
    return NextResponse.json({ error: 'sender_type must be student or teacher' }, { status: 400 })
  }

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [doubt_id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })

  if (doubt.status === 'resolved') {
    return NextResponse.json({ error: 'This doubt has been resolved and is now archived' }, { status: 400 })
  }

  const now = new Date().toISOString()
  // Only teacher can send a final answer
  const finalAnswer = sender_type === 'teacher' ? !!is_final_answer : false

  const { rows: [msg] } = await pool.query(`
    INSERT INTO doubt_messages (doubt_id, school_id, sender_type, sender_id, sender_name, message, is_final_answer)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [doubt_id, school_id, sender_type, sender_id, sender_name, message.trim(), finalAnswer])

  // Status rules:
  // - Teacher replies: open → in_progress. Stays in_progress for further chat.
  // - Final answer: status stays in_progress (student must confirm resolved)
  // - Student: stays at current status
  let newStatus = doubt.status
  if (sender_type === 'teacher' && doubt.status === 'open') {
    newStatus = 'in_progress'
  }

  await pool.query(`
    UPDATE doubts SET
      last_message_at = $3,
      message_count = COALESCE(message_count, 0) + 1,
      status = $4,
      answered_by = CASE WHEN $5::text = 'teacher' THEN $6 ELSE answered_by END,
      answered_at = CASE WHEN $5::text = 'teacher' AND answered_at IS NULL THEN $3 ELSE answered_at END
    WHERE id = $1 AND school_id = $2
  `, [doubt_id, school_id, now, newStatus, sender_type, sender_type === 'teacher' ? sender_id : null])

  // Notifications (non-blocking)
  try {
    if (sender_type === 'teacher') {
      const notifTitle = finalAnswer
        ? `Final answer posted — ${doubt.subject}`
        : `Reply to your doubt — ${doubt.subject}`
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
        VALUES ($1, $2, 'doubt_replied', $3, $4, $5)
      `, [
        school_id, doubt.student_id, notifTitle,
        `${sender_name}: "${message.trim().slice(0, 80)}${message.length > 80 ? '...' : ''}"`,
        JSON.stringify({ doubt_id: parseInt(doubt_id) }),
      ])
    } else if (sender_type === 'student' && doubt.answered_by) {
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
        VALUES ($1, $2, 'doubt_follow_up', $3, $4, $5)
      `, [
        school_id, doubt.answered_by,
        `Student follow-up — ${doubt.subject}`,
        `${sender_name}: "${message.trim().slice(0, 80)}${message.length > 80 ? '...' : ''}"`,
        JSON.stringify({ doubt_id: parseInt(doubt_id) }),
      ])
    } else if (sender_type === 'student' && !doubt.answered_by) {
      const { rows: [classTeacher] } = await pool.query(
        `SELECT id FROM teachers WHERE school_id = $1
         AND class_teacher_grade = (SELECT grade FROM classes WHERE id = $2)
         AND class_teacher_section = (SELECT section FROM classes WHERE id = $2)`,
        [school_id, doubt.class_id]
      )
      if (classTeacher) {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
          VALUES ($1, $2, 'new_doubt', $3, $4, $5)
        `, [
          school_id, classTeacher.id,
          `New message — ${doubt.subject}`,
          `${sender_name}: "${message.trim().slice(0, 80)}"`,
          JSON.stringify({ doubt_id: parseInt(doubt_id) }),
        ])
      }
    }
  } catch { /* notifications are non-critical */ }

  return NextResponse.json(msg, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id: doubt_id } = await params
  const body = await req.json()
  const { school_id, action, student_id, student_name, teacher_id, teacher_name } = body

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows: [doubt] } = await pool.query(
    'SELECT * FROM doubts WHERE id = $1 AND school_id = $2', [doubt_id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()

  // ── Teacher closes the doubt ──────────────────────────────────────────────
  if (action === 'teacher_close') {
    if (!teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })
    if (doubt.status === 'resolved') {
      return NextResponse.json({ error: 'Already resolved' }, { status: 400 })
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE doubts SET
        status = 'resolved',
        resolved_at = $3,
        closed_by_teacher = TRUE
      WHERE id = $1 AND school_id = $2
      RETURNING *
    `, [doubt_id, school_id, now])

    // Notify student
    try {
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
        VALUES ($1, $2, 'doubt_answered', $3, $4, $5)
      `, [
        school_id, doubt.student_id,
        `Doubt marked answered — ${doubt.subject}`,
        `${teacher_name || 'Your teacher'} marked your doubt as answered. Open it to re-open if still confused.`,
        JSON.stringify({ doubt_id: parseInt(doubt_id) }),
      ])
    } catch { /* non-critical */ }

    return NextResponse.json(updated)
  }

  // ── Student re-opens a teacher-closed doubt ───────────────────────────────
  if (action === 'reopen') {
    if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    if (doubt.student_id !== parseInt(student_id)) {
      return NextResponse.json({ error: 'Only the student who raised this doubt can re-open it' }, { status: 403 })
    }
    if (doubt.status !== 'resolved') {
      return NextResponse.json({ error: 'Doubt is not resolved' }, { status: 400 })
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE doubts SET
        status = 'in_progress',
        resolved_at = NULL,
        closed_by_teacher = FALSE
      WHERE id = $1 AND school_id = $2
      RETURNING *
    `, [doubt_id, school_id])

    // Notify teacher
    try {
      if (doubt.answered_by) {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
          VALUES ($1, $2, 'new_doubt', $3, $4, $5)
        `, [
          school_id, doubt.answered_by,
          `Doubt re-opened — ${doubt.subject}`,
          `${student_name || 'Student'} re-opened the doubt and still needs help.`,
          JSON.stringify({ doubt_id: parseInt(doubt_id) }),
        ])
      }
    } catch { /* non-critical */ }

    return NextResponse.json(updated)
  }

  // ── Student marks their own doubt as resolved ─────────────────────────────
  if (student_id && doubt.student_id !== parseInt(student_id)) {
    return NextResponse.json({ error: 'Only the student who raised this doubt can resolve it' }, { status: 403 })
  }

  const { rows: [updated] } = await pool.query(`
    UPDATE doubts SET
      status = 'resolved',
      resolved_at = $3,
      closed_by_teacher = FALSE
    WHERE id = $1 AND school_id = $2
    RETURNING *
  `, [doubt_id, school_id, now])

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Award points to the student who resolved the doubt
  if (updated && doubt.student_id) {
    awardPoints(doubt.student_id, parseInt(school_id), 'doubt_resolved', parseInt(doubt_id), 'doubt').catch(() => {})
  }

  // Notify teacher
  try {
    if (updated.answered_by) {
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
        VALUES ($1, $2, 'doubt_resolved', $3, $4, $5)
      `, [
        school_id, updated.answered_by,
        `Doubt marked resolved — ${updated.subject}`,
        `${student_name || 'Student'} marked their doubt as resolved. Great help!`,
        JSON.stringify({ doubt_id: parseInt(doubt_id) }),
      ])
    }
  } catch { /* non-critical */ }

  return NextResponse.json(updated)
}
