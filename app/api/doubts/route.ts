import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { generateDoubtAnswer } from '@/lib/gemini'
import { getTextbookContext } from '@/lib/textbook-search'
import { getAnySession } from '@/lib/auth'

// Hard ceiling on rows per request so a doubts feed can never come back unbounded.
const MAX_LIMIT = 500

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it (Math.min/clamping keeps NaN, which Number.isInteger catches).
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const school_id  = searchParams.get('school_id')
    const class_id   = searchParams.get('class_id')
    const student_id = searchParams.get('student_id')
    const teacher_id = searchParams.get('teacher_id')
    const status     = searchParams.get('status')
    const subject    = searchParams.get('subject')
    const is_faq     = searchParams.get('is_faq')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // getAnySession() only proves SOME valid login exists — it admits student and
    // parent sessions too. Without this check a student of school A could pass
    // school B's id and read its entire doubts feed: student names, roll numbers
    // and question text. Scope comes from the session, the param only has to agree.
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build WHERE clauses
    const conditions: string[] = ['d.school_id = $1']
    const values: (string | number)[] = [session.schoolId]

    if (class_id) { values.push(class_id); conditions.push(`d.class_id = $${values.length}`) }
    if (student_id) { values.push(student_id); conditions.push(`d.student_id = $${values.length}`) }
    if (status) { values.push(status); conditions.push(`d.status = $${values.length}`) }
    if (subject) { values.push(subject); conditions.push(`d.subject = $${values.length}`) }
    if (is_faq === 'true') { conditions.push(`d.is_class_faq = TRUE`) }

    // If teacher_id provided: return doubts from all classes this teacher is associated with
    let teacherClassJoin = ''
    if (teacher_id && !class_id) {
      teacherClassJoin = `
        AND d.class_id IN (
          SELECT DISTINCT ct.class_id FROM class_timetable ct WHERE ct.teacher_id = $${values.length + 1}
          UNION
          SELECT c.id FROM classes c WHERE c.class_teacher_id = $${values.length + 1}
        )
      `
      values.push(teacher_id)
    }

    const where = `WHERE ${conditions.join(' AND ')} ${teacherClassJoin}`
    // Only the two inner JOINs can change the row count, and both are on a primary
    // key (students.id, classes.id) so they filter without multiplying. The LEFT
    // JOINs to teachers/tasks are PK lookups too, so the count can skip them and
    // still match the listed rows exactly.
    const from = `FROM doubts d
      JOIN students s ON s.id = d.student_id
      JOIN classes c ON c.id = d.class_id`

    // Pagination is opt-in — see the note in app/api/fees/ledger/route.ts. Callers
    // that pass nothing keep today's unbounded array response.
    const paginated = searchParams.has('limit') || searchParams.has('offset')
    let pageClause = ''
    let limit = 0
    let offset = 0
    if (paginated) {
      limit = Math.min(parseCount(searchParams.get('limit'), MAX_LIMIT), MAX_LIMIT)
      offset = parseCount(searchParams.get('offset'), 0)
      if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
        return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
      }
      values.push(limit, offset)
      pageClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`
    }

    // status bucket + last activity leaves ties (same bucket, same timestamp),
    // which would drop and duplicate rows across pages — d.id makes it a total order.
    const { rows } = await pool.query(`
      SELECT
        d.id, d.school_id, d.class_id, d.student_id, d.subject, d.question,
        d.task_id, d.ai_answer, d.teacher_answer,
        d.answered_by, d.answered_at, d.status, d.created_at,
        d.last_message_at, d.message_count, d.resolved_at, d.closed_by_teacher,
        d.is_class_faq, d.faq_set_by,
        s.name AS student_name, s.roll_number,
        c.grade, c.section,
        t.name AS answered_by_name,
        tk.title AS task_title
      ${from}
      LEFT JOIN teachers t ON t.id = d.answered_by
      LEFT JOIN tasks tk ON tk.id = d.task_id
      ${where}
      ORDER BY
        CASE WHEN d.status = 'resolved' THEN 2 WHEN d.status = 'in_progress' THEN 1 ELSE 0 END,
        COALESCE(d.last_message_at, d.created_at) DESC,
        d.id DESC
      ${pageClause}
    `, values)

    if (!paginated) return NextResponse.json(rows)

    // Only paginated callers pay for the count.
    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${from} ${where}`,
      values.slice(0, values.length - 2)
    )
    return NextResponse.json({ data: rows, limit, offset, total })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAnySession()
  if (!session || session.role !== 'student') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { school_id, class_id, student_id, subject, question, task_id } = body

  if (!school_id || !class_id || !student_id) {
    return NextResponse.json({ error: 'school_id, class_id, student_id required' }, { status: 400 })
  }
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!question?.trim()) return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  if (question.trim().length < 10) {
    return NextResponse.json({ error: 'Question must be at least 10 characters' }, { status: 400 })
  }

  // Validate student belongs to this class/school
  const { rows: [student] } = await pool.query(
    `SELECT s.id FROM students s
     JOIN classes c ON c.grade = s.grade AND c.section = s.section AND c.school_id = s.school_id
     WHERE s.id = $1 AND s.school_id = $2 AND c.id = $3`,
    [student_id, school_id, class_id]
  )
  if (!student) return NextResponse.json({ error: 'Student not found in this class' }, { status: 404 })

  const { rows: [doubt] } = await pool.query(`
    INSERT INTO doubts (school_id, class_id, student_id, subject, question, task_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [school_id, class_id, student_id, subject.trim(), question.trim(), task_id || null])

  // Notify class teacher (non-blocking — don't fail the request if this errors)
  try {
    const { rows: [classTeacher] } = await pool.query(
      `SELECT id FROM teachers WHERE school_id = $1
       AND class_teacher_grade = (SELECT grade FROM classes WHERE id = $2)
       AND class_teacher_section = (SELECT section FROM classes WHERE id = $2)`,
      [school_id, class_id]
    )
    if (classTeacher) {
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
        VALUES ($1, $2, 'new_doubt', $3, $4, $5)
      `, [
        school_id, classTeacher.id,
        `New doubt — ${subject}`,
        `A student asked: "${question.trim().slice(0, 80)}${question.length > 80 ? '...' : ''}"`,
        JSON.stringify({ doubt_id: doubt.id, class_id, subject }),
      ])
    }
  } catch (notifErr) {
    console.warn('Failed to send doubt notification (non-critical):', notifErr)
  }

  // AI auto-answer — non-blocking, updates doubt after response is already sent
  if (process.env.GROQ_API_KEY) {
    const { rows: [cls] } = await pool.query(
      'SELECT grade FROM classes WHERE id = $1', [class_id]
    )
    const grade = cls?.grade ?? '8'
    getTextbookContext(Number(school_id), grade, question.trim(), subject.trim(), 2)
      .then(tbCtx => generateDoubtAnswer(subject.trim(), question.trim(), grade, tbCtx || undefined))
      .then(async (aiAnswer) => {
        if (aiAnswer) {
          await pool.query(
            'UPDATE doubts SET ai_answer = $1 WHERE id = $2',
            [aiAnswer, doubt.id]
          )
        }
      })
      .catch((err) => console.warn('Gemini doubt answer failed (non-critical):', err))
  }

  // Doubt pattern alert — if 3+ students ask about same subject in this class within 7 days, notify teacher
  try {
    const { rows: [patternRow] } = await pool.query(
      `SELECT COUNT(DISTINCT student_id) AS student_count
       FROM doubts
       WHERE class_id = $1 AND school_id = $2 AND subject = $3
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [class_id, school_id, subject.trim()]
    )
    const studentCount = parseInt(patternRow?.student_count || '0')
    // Notify at exactly 3 (avoid repeated alerts for every new doubt after 3)
    if (studentCount === 3) {
      const { rows: [classTeacher] } = await pool.query(
        `SELECT id FROM teachers WHERE school_id = $1
         AND class_teacher_grade = (SELECT grade FROM classes WHERE id = $2)
         AND class_teacher_section = (SELECT section FROM classes WHERE id = $2)`,
        [school_id, class_id]
      )
      if (classTeacher) {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
          VALUES ($1, $2, 'doubt_pattern', $3, $4, $5)
        `, [
          school_id, classTeacher.id,
          `Doubt pattern detected — ${subject}`,
          `3 or more students have asked doubts about "${subject}" in the last 7 days. Consider addressing this in class.`,
          JSON.stringify({ class_id, subject, student_count: studentCount }),
        ])
      }
    }
  } catch (patternErr) {
    console.warn('Failed to send doubt pattern alert (non-critical):', patternErr)
  }

  return NextResponse.json(doubt, { status: 201 })
}
