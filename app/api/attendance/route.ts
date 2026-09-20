import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getStaffActor, actorDisplayName, type StaffActor } from '@/lib/attendanceAuth'
import {
  getClassForSchool, getRoster, getSessionLock, nonWorkingDay, nonWorkingDaysMap,
} from '@/lib/attendance'
import { buildStudentAttendanceView } from '@/lib/attendanceStudentView'
import { markSession, editSession, type MarkInput } from '@/lib/attendanceMarking'
import { notifyAbsentParents } from '@/lib/attendanceNotify'
import {
  ATTENDANCE_SESSIONS, ATTENDANCE_STATUSES, checkMarkingWindow, countWorkingSessions, isValidDateStr,
  isValidMonthStr, monthBounds, summarizeCounts, todayIST,
  type AttendanceSession, type SessionRecord,
} from '@/lib/attendanceRules'

// Class-level attendance: read and write. TEACHERS AND SCHOOL ADMINS ONLY.
// Students and parents have their own routes (/api/student/attendance, /api/parent/attendance)
// that can only ever return their own child's records.
//
// GET  ?view=school&date=            every class's marked/unmarked status for a day
// GET  ?view=sheet&class_id&date&session=   everything the mark sheet needs in one call
// GET  ?view=student&student_id[&month=]   one student's shared view (calendar, %, trend) — same builder
//                                          the parent and student apps use, so the numbers always match
// GET  ?view=class-month&class_id&month=   every student's month %, by the shared rules
// GET  ?class_id&date[&session]      raw records for one day
// GET  ?class_id&date&summary=true   per-session counts + who marked
// GET  ?class_id&month=YYYY-MM       a month of records
// GET  ?class_id&previous=true[&session]  the last recorded day (for "copy last day")
// POST {class_id,date,session,records}   claim + save a session (409 if already marked / holiday)
// PUT  same body                          correct a session (admin, or the marker on the same day)
//
// The school always comes from the session — a school_id/teacher_id in the request is ignored
// (and a school_id that disagrees with the session is refused).

const sessionParam = z.enum(ATTENDANCE_SESSIONS)

const markBody = z.object({
  class_id: z.coerce.number().int().positive(),
  date: z.string().refine(isValidDateStr, 'date must be YYYY-MM-DD'),
  session: sessionParam,
  records: z.array(z.object({
    student_id: z.coerce.number().int().positive(),
    status: z.enum(ATTENDANCE_STATUSES),
  })).min(1).max(500),
}).passthrough() // school_id / teacher_id from older clients are accepted and ignored

function json(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status })
}

function checkSchoolParam(actor: StaffActor, raw: string | null): boolean {
  return raw === null || Number(raw) === actor.schoolId
}

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const actor = await getStaffActor()
    if (!actor) return json('Unauthorized', 401)

    const p = req.nextUrl.searchParams
    if (!checkSchoolParam(actor, p.get('school_id'))) return json('Forbidden', 403)
    const schoolId = actor.schoolId

    const date = p.get('date')
    const month = p.get('month')
    const view = p.get('view')
    const sessionRaw = p.get('session')
    const parsedSession = sessionRaw === null ? null : sessionParam.safeParse(sessionRaw)
    if (parsedSession && !parsedSession.success) return json('session must be morning or afternoon', 400)
    const session: AttendanceSession | null = parsedSession?.success ? parsedSession.data : null
    if (date !== null && !isValidDateStr(date)) return json('date must be YYYY-MM-DD', 400)
    if (month !== null && !isValidMonthStr(month)) return json('month must be YYYY-MM', 400)

    // ── School-wide: every class's status for one day
    if (view === 'school') {
      if (!date) return json('date required', 400)
      const { rows } = await pool.query(
        `WITH session_stats AS (
           SELECT a.class_id, a.session,
             COUNT(*) AS total_marked,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN a.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN a.status = 'late'    THEN 1 ELSE 0 END) AS late
           FROM attendance a
           WHERE a.school_id = $1 AND a.date = $2
           GROUP BY a.class_id, a.session
         )
         SELECT c.id, c.grade, c.section, ct.name AS class_teacher_name,
                ms.total_marked AS morning_total, ms.present AS morning_present,
                ms.absent AS morning_absent, ms.late AS morning_late,
                mk.marked_by_name AS morning_marked_by, mk.marked_at AS morning_marked_at,
                afs.total_marked AS afternoon_total, afs.present AS afternoon_present,
                afs.absent AS afternoon_absent, afs.late AS afternoon_late,
                ak.marked_by_name AS afternoon_marked_by, ak.marked_at AS afternoon_marked_at
         FROM classes c
         LEFT JOIN teachers ct ON ct.id = c.class_teacher_id
         LEFT JOIN session_stats ms  ON ms.class_id = c.id  AND ms.session = 'morning'
         LEFT JOIN session_stats afs ON afs.class_id = c.id AND afs.session = 'afternoon'
         LEFT JOIN attendance_sessions mk ON mk.class_id = c.id AND mk.date = $2 AND mk.session = 'morning'
         LEFT JOIN attendance_sessions ak ON ak.class_id = c.id AND ak.date = $2 AND ak.session = 'afternoon'
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
        [schoolId, date]
      )
      return NextResponse.json(rows)
    }

    // ── One student (teachers/admins looking at a child) — identical numbers to the parent/student apps
    if (view === 'student') {
      const studentId = Number(p.get('student_id'))
      if (!Number.isInteger(studentId) || studentId <= 0) return json('student_id required', 400)
      const v = await buildStudentAttendanceView(schoolId, studentId, month)
      return v ? NextResponse.json(v) : json('Student not found', 404)
    }

    // Everything below is about one class — it must be this school's.
    const classId = Number(p.get('class_id'))
    if (!Number.isInteger(classId) || classId <= 0) return json('class_id required', 400)
    const cls = await getClassForSchool(schoolId, classId)
    if (!cls) return json('Class not found', 404)

    // ── Mark sheet: roster + lock + holiday + what this person may do, in one round trip
    if (view === 'sheet') {
      if (!date || !session) return json('date and session required', 400)
      const today = todayIST()
      const [roster, lock, nw, recs] = await Promise.all([
        getRoster(schoolId, cls),
        getSessionLock(classId, date, session),
        nonWorkingDay(schoolId, date),
        pool.query<{ student_id: number; status: string }>(
          `SELECT student_id, status FROM attendance WHERE class_id = $1 AND date = $2 AND session = $3`,
          [classId, date, session]
        ),
      ])
      const byStudent = new Map(recs.rows.map(r => [r.student_id, r.status]))
      const window = checkMarkingWindow(date, today, actor.kind === 'admin' ? 'admin' : 'teacher')
      const byMe = lock
        ? (actor.kind === 'teacher' ? lock.marked_by_teacher_id === actor.teacherId : lock.marked_by_user_id === actor.userId)
        : false
      const canMark = !nw && !lock && window.ok && roster.length > 0
      const canEdit = !!lock && !nw && (actor.kind === 'admin' || (byMe && date === today))
      const students = roster.map(s => ({
        id: s.id, name: s.name, roll_number: s.roll_number,
        status: lock ? (byStudent.get(s.id) ?? null) : null,
      }))
      const counts = { present: 0, late: 0, absent: 0 }
      for (const s of students) if (s.status === 'present' || s.status === 'late' || s.status === 'absent') counts[s.status]++
      return NextResponse.json({
        class: cls, date, session, today, students, counts,
        nonWorking: nw,
        window: window.ok ? { ok: true } : { ok: false, code: window.code, message: window.message },
        lock: lock ? {
          markedBy: lock.marked_by_name, markedByRole: lock.marked_by_role, markedAt: lock.marked_at,
          editedBy: lock.last_edited_by_name, editedAt: lock.last_edited_at, editCount: lock.edit_count, byMe,
        } : null,
        canMark, canEdit,
      })
    }

    // ── Every student's percentage for a month, by the shared rules (holidays out, late = attended)
    if (view === 'class-month') {
      if (!month) return json('month required', 400)
      const { from, to } = monthBounds(month)
      const [roster, recs, nonWorking] = await Promise.all([
        getRoster(schoolId, cls),
        pool.query<SessionRecord & { student_id: number }>(
          `SELECT student_id, date::text AS date, session, status FROM attendance
           WHERE class_id = $1 AND school_id = $2 AND date BETWEEN $3::date AND $4::date`,
          [classId, schoolId, from, to]),
        nonWorkingDaysMap(schoolId, from, to),
      ])
      const by = new Map<number, SessionRecord[]>()
      for (const r of recs.rows) by.set(r.student_id, [...(by.get(r.student_id) ?? []), r])
      const today = todayIST()
      return NextResponse.json({
        month,
        students: roster.map(s => ({ id: s.id, ...summarizeCounts(countWorkingSessions(by.get(s.id) ?? [], nonWorking, today, s.join_date)) })),
        nonWorking: [...nonWorking.entries()].map(([date, v]) => ({ date, kind: v.kind, title: v.title })),
      })
    }

    // ── Summary: per-session counts + who marked, for one date
    if (p.get('summary') === 'true') {
      if (!date) return json('date required for summary', 400)
      const { rows } = await pool.query(
        `SELECT a.session,
                COUNT(*) AS total,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN a.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN a.status = 'late'    THEN 1 ELSE 0 END) AS late,
                k.marked_by_name, k.marked_at
         FROM attendance a
         LEFT JOIN attendance_sessions k ON k.class_id = a.class_id AND k.date = a.date AND k.session = a.session
         WHERE a.class_id = $1 AND a.date = $2 AND a.school_id = $3
         GROUP BY a.session, k.marked_by_name, k.marked_at`,
        [classId, date, schoolId]
      )
      const out: Record<string, unknown> = {}
      for (const r of rows) {
        out[r.session] = {
          total: Number(r.total), present: Number(r.present), absent: Number(r.absent), late: Number(r.late),
          marked_by_name: r.marked_by_name, marked_at: r.marked_at,
        }
      }
      return NextResponse.json(out)
    }

    // ── A month of records
    if (month) {
      const { rows } = await pool.query(
        `SELECT a.student_id, a.date::text AS date, a.session, a.status, s.name AS student_name, s.roll_number
         FROM attendance a JOIN students s ON s.id = a.student_id
         WHERE a.class_id = $1 AND a.school_id = $2 AND TO_CHAR(a.date, 'YYYY-MM') = $3
         ORDER BY s.roll_number, s.name, a.date, a.session`,
        [classId, schoolId, month]
      )
      return NextResponse.json(rows)
    }

    // ── The last day this class was marked (optionally for one session)
    if (p.get('previous') === 'true') {
      const dateRes = await pool.query<{ date: string }>(
        `SELECT DISTINCT date::text AS date FROM attendance
         WHERE class_id = $1 AND school_id = $2 AND ($3::text IS NULL OR session = $3)
         ORDER BY date DESC LIMIT 1`,
        [classId, schoolId, session]
      )
      if (!dateRes.rows[0]) return NextResponse.json([])
      const lastDate = dateRes.rows[0].date
      const { rows } = await pool.query(
        `SELECT a.student_id, a.session, a.status, s.name AS student_name, s.roll_number
         FROM attendance a JOIN students s ON s.id = a.student_id
         WHERE a.class_id = $1 AND a.school_id = $2 AND a.date = $3 AND ($4::text IS NULL OR a.session = $4)
         ORDER BY s.roll_number, s.name`,
        [classId, schoolId, lastDate, session]
      )
      return NextResponse.json({ date: lastDate, records: rows })
    }

    // ── One day (one or both sessions)
    if (!date) return json('date required', 400)
    const { rows } = await pool.query(
      `SELECT a.*, a.date::text AS date, s.name AS student_name, s.roll_number
       FROM attendance a JOIN students s ON s.id = a.student_id
       WHERE a.class_id = $1 AND a.date = $2 AND a.school_id = $3 AND ($4::text IS NULL OR a.session = $4)
       ORDER BY a.session, s.roll_number, s.name`,
      [classId, date, schoolId, session]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[attendance GET]', err)
    return json('Failed to fetch attendance', 500)
  }
}

async function handleSave(req: NextRequest, mode: 'mark' | 'edit') {
  try {
    await ensureDB()
    const actor = await getStaffActor()
    if (!actor) return json('Unauthorized', 401)

    const body = await req.json().catch(() => null)
    const parsed = markBody.safeParse(body)
    if (!parsed.success) return json(parsed.error.issues[0]?.message ?? 'Invalid request', 400)
    if (body && typeof body === 'object' && 'school_id' in body && Number((body as { school_id: unknown }).school_id) !== actor.schoolId) {
      return json('Forbidden', 403)
    }

    // Identity comes from the login. A teacher who is deactivated or removed cannot mark.
    const name = await actorDisplayName(actor)
    if (!name) return json('Your account is not active.', 403)

    const input: MarkInput = {
      classId: parsed.data.class_id, date: parsed.data.date, session: parsed.data.session, records: parsed.data.records,
    }
    const result = mode === 'mark' ? await markSession(actor, name, input) : await editSession(actor, name, input)
    if (!result.ok) return json(result.message, result.status, { code: result.code, ...(result.extra ?? {}) })

    if (result.newlyAbsent.length > 0) {
      after(async () => {
        try {
          await notifyAbsentParents({
            schoolId: actor.schoolId, classId: input.classId, date: input.date,
            session: input.session, studentIds: result.newlyAbsent,
          })
        } catch (err) { console.error('[attendance] notify', err) }
      })
    }

    return NextResponse.json({
      success: true,
      saved: result.saved,
      notified: result.newlyAbsent.length,   // parents being told (email is sent after this response)
      lock: {
        markedBy: result.lock.marked_by_name, markedAt: result.lock.marked_at,
        editedBy: result.lock.last_edited_by_name, editedAt: result.lock.last_edited_at,
      },
    }, { status: mode === 'mark' ? 201 : 200 })
  } catch (err) {
    console.error(`[attendance ${mode}]`, err)
    return json('Failed to save attendance', 500)
  }
}

export async function POST(req: NextRequest) { return handleSave(req, 'mark') }
export async function PUT(req: NextRequest)  { return handleSave(req, 'edit') }
