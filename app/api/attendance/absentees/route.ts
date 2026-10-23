import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getAdminActor } from '@/lib/attendanceAuth'
import { nonWorkingDay } from '@/lib/attendance'
import { isValidDateStr, todayIST } from '@/lib/attendanceRules'

// GET /api/attendance/absentees?date=YYYY-MM-DD&session=morning|afternoon   (school admins only)
//
// Everyone who was absent in one session, class by class, on ONE page: for each class the absent
// students (roll no, parent and phone, and whether they were also absent in the other session), plus
// the classes that have not marked that session yet. The school comes from the login.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const date = req.nextUrl.searchParams.get('date') ?? todayIST()
    if (!isValidDateStr(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    const session = req.nextUrl.searchParams.get('session') ?? 'morning'
    if (session !== 'morning' && session !== 'afternoon') return NextResponse.json({ error: 'session must be morning or afternoon' }, { status: 400 })
    const other = session === 'morning' ? 'afternoon' : 'morning'

    const [nw, classRows, absentRows] = await Promise.all([
      nonWorkingDay(admin.schoolId, date),
      pool.query(
        `SELECT c.id, c.grade, c.section, ct.name AS class_teacher, k.marked_by_name, k.marked_at,
                (SELECT COUNT(*)::int FROM students s
                  WHERE s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section
                    AND (s.status IS NULL OR s.status = 'active')) AS student_count,
                (SELECT COUNT(*)::int FROM attendance a WHERE a.class_id = c.id AND a.date = $2::date AND a.session = $3) AS marked_students
         FROM classes c
         LEFT JOIN teachers ct ON ct.id = c.class_teacher_id
         LEFT JOIN attendance_sessions k ON k.class_id = c.id AND k.date = $2::date AND k.session = $3
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
        [admin.schoolId, date, session]
      ),
      pool.query(
        `SELECT a.class_id, s.id AS student_id, s.name, s.school_roll_number, s.parent_name, s.parent_phone,
                (SELECT a2.status FROM attendance a2
                  WHERE a2.student_id = s.id AND a2.class_id = a.class_id AND a2.date = a.date AND a2.session = $4) AS other_status
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
         WHERE a.school_id = $1 AND a.date = $2::date AND a.session = $3 AND a.status = 'absent'
         ORDER BY s.school_roll_number NULLS LAST, s.name`,
        [admin.schoolId, date, session, other]
      ),
    ])

    type Absent = { student_id: number; name: string; roll: number | null; parent_name: string | null; parent_phone: string | null; whole_day: boolean }
    const byClass = new Map<number, Absent[]>()
    for (const r of absentRows.rows) {
      const list = byClass.get(r.class_id) ?? []
      list.push({ student_id: r.student_id, name: r.name, roll: r.school_roll_number, parent_name: r.parent_name, parent_phone: r.parent_phone, whole_day: r.other_status === 'absent' })
      byClass.set(r.class_id, list)
    }

    const classes = classRows.rows.map(c => ({
      id: c.id as number, grade: c.grade as string, section: c.section as string,
      class_teacher: (c.class_teacher as string | null) ?? null,
      student_count: c.student_count as number,
      marked: c.marked_students > 0,
      marked_by: (c.marked_by_name as string | null) ?? null,
      absent: byClass.get(c.id) ?? [],
    }))
    const marked = classes.filter(c => c.marked)
    return NextResponse.json({
      date, session,
      non_working: nw ? { kind: nw.kind, title: nw.title } : null,
      totals: {
        absent: classes.reduce((n, c) => n + c.absent.length, 0),
        classes: classes.length,
        classes_marked: marked.length,
        classes_with_absentees: classes.filter(c => c.absent.length > 0).length,
      },
      classes,
    })
  } catch (err) {
    console.error('[attendance/absentees]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
