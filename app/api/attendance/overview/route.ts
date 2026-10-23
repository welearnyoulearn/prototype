import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getStaffActor } from '@/lib/attendanceAuth'
import { nonWorkingDay } from '@/lib/attendance'
import { checkMarkingWindow, isValidDateStr, todayIST } from '@/lib/attendanceRules'

// GET /api/attendance/overview?date=YYYY-MM-DD   (teachers and school admins)
//
// One call for the class picker (teacher) and the "Today" panel (admin): for every class,
// whether Morning / Afternoon is marked, by whom, and the counts — plus whether the date is a
// holiday or weekly off, and whether this person may still mark that date.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const actor = await getStaffActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = todayIST()
    const date = req.nextUrl.searchParams.get('date') ?? today
    if (!isValidDateStr(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })

    const [nw, classes, reports] = await Promise.all([
      nonWorkingDay(actor.schoolId, date),
      pool.query(
        `SELECT c.id, c.grade, c.section, ct.name AS class_teacher_name,
                (SELECT COUNT(*)::int FROM students s
                  WHERE s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section
                    AND (s.status IS NULL OR s.status = 'active')) AS student_count,
                k.session, k.marked_by_name, k.marked_by_role, k.marked_at, k.marked_by_teacher_id, k.last_edited_by_name,
                st.present, st.late, st.absent
         FROM classes c
         LEFT JOIN teachers ct ON ct.id = c.class_teacher_id
         LEFT JOIN attendance_sessions k ON k.class_id = c.id AND k.date = $2
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
                  COUNT(*) FILTER (WHERE a.status = 'late')::int    AS late,
                  COUNT(*) FILTER (WHERE a.status = 'absent')::int  AS absent
           FROM attendance a WHERE a.class_id = c.id AND a.date = $2 AND a.session = k.session
         ) st ON TRUE
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
        [actor.schoolId, date]
      ),
      actor.kind === 'admin'
        ? pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM attendance_issue_reports WHERE school_id = $1 AND status = 'open'`, [actor.schoolId])
        : Promise.resolve({ rows: [{ n: 0 }] }),
    ])

    type SessionState = {
      marked: boolean; markedBy: string | null; markedByRole: string | null; markedAt: string | null
      byMe: boolean; editedBy: string | null; present: number; late: number; absent: number
    }
    const empty = (): SessionState => ({
      marked: false, markedBy: null, markedByRole: null, markedAt: null, byMe: false, editedBy: null, present: 0, late: 0, absent: 0,
    })
    const byClass = new Map<number, {
      id: number; grade: string; section: string; classTeacher: string | null; studentCount: number
      morning: SessionState; afternoon: SessionState
    }>()
    for (const r of classes.rows) {
      const c = byClass.get(r.id) ?? {
        id: r.id, grade: r.grade, section: r.section, classTeacher: r.class_teacher_name,
        studentCount: r.student_count, morning: empty(), afternoon: empty(),
      }
      if (r.session === 'morning' || r.session === 'afternoon') {
        c[r.session as 'morning' | 'afternoon'] = {
          marked: true, markedBy: r.marked_by_name, markedByRole: r.marked_by_role, markedAt: r.marked_at,
          byMe: actor.kind === 'teacher' && r.marked_by_teacher_id === actor.teacherId,
          editedBy: r.last_edited_by_name, present: r.present ?? 0, late: r.late ?? 0, absent: r.absent ?? 0,
        }
      }
      byClass.set(r.id, c)
    }
    const list = [...byClass.values()]
    const window = checkMarkingWindow(date, today, actor.kind === 'admin' ? 'admin' : 'teacher')

    // "Not marked" only makes sense for a working day that has started.
    const workingToday = !nw && date <= today
    const notMarked = workingToday
      ? list.filter(c => c.studentCount > 0 && !c.morning.marked).map(c => ({ id: c.id, grade: c.grade, section: c.section, classTeacher: c.classTeacher }))
      : []

    return NextResponse.json({
      date, today, nonWorking: nw,
      canMark: !nw && window.ok,
      window: window.ok ? { ok: true } : { ok: false, code: window.code, message: window.message },
      classes: list,
      totals: {
        classes: list.length,
        morningMarked: list.filter(c => c.morning.marked).length,
        afternoonMarked: list.filter(c => c.afternoon.marked).length,
        notMarkedMorning: notMarked,
        openReports: reports.rows[0].n,
      },
    })
  } catch (err) {
    console.error('[attendance overview]', err)
    return NextResponse.json({ error: 'Failed to load attendance overview' }, { status: 500 })
  }
}
