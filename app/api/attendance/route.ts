import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import nodemailer from 'nodemailer'
import { getAnySession } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/attendance
//   ?school_id=X&date=YYYY-MM-DD&view=school                           → school-wide: all classes attendance status for that day
//   ?class_id=X&date=YYYY-MM-DD&school_id=X&session=morning|afternoon  → single day+session
//   ?class_id=X&month=YYYY-MM&school_id=X                              → full month (both sessions)
//   ?class_id=X&school_id=X&previous=true&session=morning|afternoon    → last recorded date for that session
//   ?class_id=X&school_id=X&date=YYYY-MM-DD&summary=true               → per-session summary (who marked, counts)
export async function GET(req: NextRequest) {
  try {
    const authSession = await getAnySession()
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const class_id  = searchParams.get('class_id')
    const date      = searchParams.get('date')
    const month     = searchParams.get('month')
    const school_id = searchParams.get('school_id')
    const previous  = searchParams.get('previous')
    const summary   = searchParams.get('summary')
    const view      = searchParams.get('view')
    const session   = searchParams.get('session') // 'morning' | 'afternoon' | null (both)

    if (!school_id) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    }

    try {
      // ── School-wide: attendance status for every class on a given date
      if (view === 'school') {
        if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })
        const result = await pool.query(
          `WITH class_students AS (
             SELECT class_id, COUNT(*) AS total
             FROM (
               SELECT DISTINCT c.id AS class_id
               FROM classes c WHERE c.school_id = $1
             ) cls
             JOIN students s ON s.school_id = $1
               AND s.grade = (SELECT grade FROM classes WHERE id = cls.class_id)
               AND s.section = (SELECT section FROM classes WHERE id = cls.class_id)
               AND (s.status IS NULL OR s.status = 'active')
             GROUP BY class_id
           ),
           session_stats AS (
             SELECT a.class_id, a.session,
               COUNT(*) AS total_marked,
               SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
               SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent,
               SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END) AS late
             FROM attendance a
             WHERE a.school_id = $1 AND a.date = $2
             GROUP BY a.class_id, a.session
           ),
           latest_marker AS (
             SELECT DISTINCT ON (class_id, session)
               class_id, session, marked_by_teacher_id, marked_at
             FROM attendance
             WHERE school_id = $1 AND date = $2
             ORDER BY class_id, session, marked_at DESC
           )
           SELECT c.id, c.grade, c.section,
                  ct.name AS class_teacher_name,
                  -- morning
                  ms.total_marked AS morning_total,
                  ms.present AS morning_present,
                  ms.absent  AS morning_absent,
                  ms.late    AS morning_late,
                  mm.name    AS morning_marked_by,
                  lmm.marked_at AS morning_marked_at,
                  -- afternoon
                  as2.total_marked AS afternoon_total,
                  as2.present AS afternoon_present,
                  as2.absent  AS afternoon_absent,
                  as2.late    AS afternoon_late,
                  am.name     AS afternoon_marked_by,
                  lma.marked_at AS afternoon_marked_at
           FROM classes c
           LEFT JOIN teachers ct ON ct.id = c.class_teacher_id
           LEFT JOIN session_stats ms  ON ms.class_id = c.id AND ms.session = 'morning'
           LEFT JOIN session_stats as2 ON as2.class_id = c.id AND as2.session = 'afternoon'
           LEFT JOIN latest_marker lmm ON lmm.class_id = c.id AND lmm.session = 'morning'
           LEFT JOIN latest_marker lma ON lma.class_id = c.id AND lma.session = 'afternoon'
           LEFT JOIN teachers mm ON mm.id = lmm.marked_by_teacher_id
           LEFT JOIN teachers am ON am.id = lma.marked_by_teacher_id
           WHERE c.school_id = $1
           ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
          [school_id, date]
        )
        return NextResponse.json(result.rows)
      }

    if (!class_id) {
      return NextResponse.json({ error: 'class_id required' }, { status: 400 })
    }

      // ── Summary: per-session stats + who marked last, for a specific date
      if (summary === 'true') {
        if (!date) return NextResponse.json({ error: 'date required for summary' }, { status: 400 })
        const result = await pool.query(
          `WITH session_stats AS (
             SELECT session,
               COUNT(*) AS total,
               SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
               SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent,
               SUM(CASE WHEN status='late'    THEN 1 ELSE 0 END) AS late
             FROM attendance
             WHERE class_id = $1 AND date = $2 AND school_id = $3
             GROUP BY session
           ),
           latest_marker AS (
             SELECT DISTINCT ON (session)
               session, marked_by_teacher_id, marked_at
             FROM attendance
             WHERE class_id = $1 AND date = $2 AND school_id = $3
             ORDER BY session, marked_at DESC
           )
           SELECT ss.session, ss.total, ss.present, ss.absent, ss.late,
                  t.name AS marked_by_name, lm.marked_at
           FROM session_stats ss
           LEFT JOIN latest_marker lm ON lm.session = ss.session
           LEFT JOIN teachers t ON t.id = lm.marked_by_teacher_id`,
          [class_id, date, school_id]
        )
        // Shape: { morning: {...}, afternoon: {...} }
        const out: Record<string, unknown> = {}
        for (const row of result.rows) {
          out[row.session] = {
            total: Number(row.total),
            present: Number(row.present),
            absent: Number(row.absent),
            late: Number(row.late),
            marked_by_name: row.marked_by_name,
            marked_at: row.marked_at,
          }
        }
        return NextResponse.json(out)
      }

      // ── Monthly: all records for that month (both sessions)
      if (month) {
        const result = await pool.query(
          `SELECT a.student_id, a.date, a.session, a.status,
                  s.name AS student_name, s.roll_number
           FROM attendance a
           JOIN students s ON s.id = a.student_id
           WHERE a.class_id = $1 AND a.school_id = $2
             AND TO_CHAR(a.date, 'YYYY-MM') = $3
           ORDER BY s.roll_number, s.name, a.date, a.session`,
          [class_id, school_id, month]
        )
        return NextResponse.json(result.rows)
      }

      // ── Previous: most recent date for a given session
      if (previous === 'true') {
        const sessionFilter = session ? `AND session = '${session}'` : ''
        const dateRes = await pool.query(
          `SELECT DISTINCT date FROM attendance
           WHERE class_id = $1 AND school_id = $2 ${sessionFilter}
           ORDER BY date DESC LIMIT 1`,
          [class_id, school_id]
        )
        if (!dateRes.rows[0]) return NextResponse.json([])
        const lastDate = dateRes.rows[0].date
        const sessFilter = session ? `AND session = $4` : ''
        const params: (string | number)[] = [class_id, school_id, lastDate]
        if (session) params.push(session)
        const result = await pool.query(
          `SELECT a.student_id, a.session, a.status, s.name AS student_name, s.roll_number
           FROM attendance a
           JOIN students s ON s.id = a.student_id
           WHERE a.class_id = $1 AND a.school_id = $2 AND a.date = $3 ${sessFilter}
           ORDER BY s.roll_number, s.name`,
          params
        )
        return NextResponse.json({ date: lastDate, records: result.rows })
      }

      // ── Single day (one or both sessions)
      if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })
      const sessFilter = session ? `AND a.session = $4` : ''
      const params: (string | number)[] = [class_id, date, school_id]
      if (session) params.push(session)
      const result = await pool.query(
        `SELECT a.*, s.name AS student_name, s.roll_number
         FROM attendance a
         JOIN students s ON s.id = a.student_id
         WHERE a.class_id = $1 AND a.date = $2 AND a.school_id = $3 ${sessFilter}
         ORDER BY a.session, s.roll_number, s.name`,
        params
      )
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error('[attendance GET]', error)
      return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/attendance
// Body: { school_id, class_id, teacher_id, date, session: 'morning'|'afternoon', records: [{ student_id, status }] }
export async function POST(req: NextRequest) {
  try {
    const auth = await getAnySession()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { school_id, class_id, teacher_id, date, session, records } = await req.json()

      if (!school_id || !class_id || !teacher_id || !date || !session || !Array.isArray(records)) {
        return NextResponse.json({ error: 'Missing required fields (including session)' }, { status: 400 })
      }
      if (!['morning', 'afternoon'].includes(session)) {
        return NextResponse.json({ error: 'session must be morning or afternoon' }, { status: 400 })
      }

      for (const rec of records) {
        await pool.query(
          `INSERT INTO attendance (school_id, class_id, student_id, date, session, status, marked_by_teacher_id, marked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (student_id, date, class_id, session)
           DO UPDATE SET status = EXCLUDED.status, marked_by_teacher_id = EXCLUDED.marked_by_teacher_id, marked_at = NOW()`,
          [school_id, class_id, rec.student_id, date, session, rec.status, teacher_id]
        )
      }

      // Send email notifications for absent students
      const absentIds: number[] = records
        .filter((r: { student_id: number; status: string }) => r.status === 'absent')
        .map((r: { student_id: number; status: string }) => r.student_id)

      let notified = 0
      if (absentIds.length > 0) {
        const studRes = await pool.query(
          `SELECT s.name, s.parent_name, s.parent_email, c.grade, c.section
           FROM students s JOIN classes c ON c.id = $1
           WHERE s.id = ANY($2::int[])`,
          [class_id, absentIds]
        )
        const sessionLabel = session === 'morning' ? 'Morning' : 'Afternoon'
        const dateFormatted = new Date(date).toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })

        for (const student of studRes.rows) {
          if (!student.parent_email) continue
          try {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            })
            await transporter.sendMail({
              from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
              to: student.parent_email,
              subject: `Attendance Alert: ${student.name} absent — ${sessionLabel} session on ${dateFormatted}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
                  <div style="background:#dc2626;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0;font-size:18px">Attendance Alert — ${sessionLabel} Session</h2>
                  </div>
                  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                    <p style="color:#374151;font-size:15px">Dear <strong>${student.parent_name || 'Parent/Guardian'}</strong>,</p>
                    <p style="color:#374151;font-size:15px">
                      Your child <strong>${student.name}</strong> was marked
                      <strong style="color:#dc2626">absent</strong> during the
                      <strong>${sessionLabel} session</strong> of
                      <strong>Class ${student.grade}-${student.section}</strong> on
                      <strong>${dateFormatted}</strong>.
                    </p>
                    <p style="color:#6b7280;font-size:13px;margin-top:20px">
                      If this is an error or you have already informed the school, please contact the class teacher.
                    </p>
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
                    <p style="color:#9ca3af;font-size:12px">WLYL School Management System</p>
                  </div>
                </div>`,
            })
            notified++
          } catch (emailErr) {
            console.error(`[attendance] Email failed for ${student.parent_email}:`, emailErr)
          }
        }
      }

      return NextResponse.json({ success: true, saved: records.length, notified })
    } catch (error) {
      console.error('[attendance POST]', error)
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
