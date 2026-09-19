import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/substitutes?school_id=X&leave_request_id=Y       → get all substitute assignments for a leave request
// GET /api/substitutes?school_id=X&date=YYYY-MM-DD          → get substitutes active on a date (for visibility)
// GET /api/substitutes?school_id=X&class_id=Y               → get all substitutes for a class (optionally &date=)
// GET /api/substitutes?school_id=X&substitute_teacher_id=Y  → get this teacher's substitute duties (optionally &date=)
// GET /api/substitutes?school_id=X&day=Monday&period=N      → get free teachers for a day+period slot
export async function GET(req: NextRequest) {
  try {
    const authSession = await getAnySession()
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const school_id = searchParams.get('school_id')
    const leave_request_id = searchParams.get('leave_request_id')
    const date = searchParams.get('date')
    const day = searchParams.get('day')
    const period = searchParams.get('period')
    const exclude_teacher = searchParams.get('exclude_teacher') // teacher on leave
    const substitute_teacher_id = searchParams.get('substitute_teacher_id')
    const class_id = searchParams.get('class_id')
    const uncovered = searchParams.get('uncovered') // 'true' → find uncovered periods for a date

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (Number(school_id) !== Number(authSession.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      // Uncovered periods: approved leave days where teacher has timetable slots with no substitute assigned
      if (uncovered === 'true' && date) {
        const result = await pool.query(
          `SELECT
             ct.class_id, c.grade, c.section,
             ct.period_number, ct.subject_name, ct.time_from, ct.time_to,
             t.id   AS teacher_id,
             t.name AS teacher_name,
             t.department,
             lr.id  AS leave_request_id,
             lr.leave_type
           FROM leave_requests lr
           JOIN teachers t ON t.id = lr.teacher_id
           JOIN class_timetable ct
             ON ct.school_id = $1
            AND ct.teacher_id = t.id
            AND ct.day_of_week = to_char($2::date, 'FMDay')
            AND ct.is_break = FALSE
            AND ct.subject_name IS NOT NULL
           JOIN classes c ON c.id = ct.class_id
           LEFT JOIN substitute_assignments sa
             ON sa.class_id    = ct.class_id
            AND sa.period_number = ct.period_number
            AND sa.date         = $2::date
            AND sa.school_id    = $1
           WHERE lr.school_id = $1
             AND lr.status    = 'approved'
             AND $2::date BETWEEN lr.start_date::date AND lr.end_date::date
             AND sa.id IS NULL
           ORDER BY ct.period_number, t.name`,
          [school_id, date]
        )
        return NextResponse.json(result.rows)
      }

      // All substitute assignments for a specific class (optionally filtered by date)
      if (class_id) {
        const vals: (string | number)[] = [school_id, class_id]
        let q = `SELECT sa.*,
                        ot.name AS original_teacher_name,
                        ot.department AS original_teacher_department,
                        st.name AS substitute_teacher_name,
                        st.subject AS substitute_teacher_subject,
                        st.department AS substitute_teacher_department,
                        c.grade, c.section
                 FROM substitute_assignments sa
                 LEFT JOIN teachers ot ON ot.id = sa.original_teacher_id
                 LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id
                 LEFT JOIN classes c ON c.id = sa.class_id
                 WHERE sa.school_id = $1 AND sa.class_id = $2`
        if (date) { q += ` AND sa.date = $3`; vals.push(date) }
        q += ` ORDER BY sa.date, sa.period_number`
        const result = await pool.query(q, vals)
        return NextResponse.json(result.rows)
      }

      // Substitute duties for a specific teacher (optionally filtered by date)
      if (substitute_teacher_id) {
        const vals: (string | number)[] = [school_id, substitute_teacher_id]
        let q = `SELECT sa.*,
                        ot.name AS original_teacher_name,
                        ot.department AS original_teacher_department,
                        st.name AS substitute_teacher_name,
                        st.subject AS substitute_teacher_subject,
                        st.department AS substitute_teacher_department,
                        c.grade, c.section
                 FROM substitute_assignments sa
                 LEFT JOIN teachers ot ON ot.id = sa.original_teacher_id
                 LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id
                 LEFT JOIN classes c ON c.id = sa.class_id
                 WHERE sa.school_id = $1 AND sa.substitute_teacher_id = $2`
        if (date) { q += ` AND sa.date = $3`; vals.push(date) }
        q += ` ORDER BY sa.date, sa.period_number`
        const result = await pool.query(q, vals)
        return NextResponse.json(result.rows)
      }

      // Free teachers for a specific day + period (no class_timetable assignment in that slot,
      // and not on approved leave on the given date)
      if (day && period) {
        const result = await pool.query(
          `SELECT t.id, t.name, t.employee_id, t.department, t.subject
           FROM teachers t
           WHERE t.school_id = $1
             AND (t.status IS NULL OR t.status = 'active')
             AND ($2::integer IS NULL OR t.id != $2::integer)
             AND t.id NOT IN (
               SELECT COALESCE(ct.teacher_id, 0)
               FROM class_timetable ct
               WHERE ct.school_id = $1
                 AND ct.day_of_week = $3
                 AND ct.period_number = $4
                 AND ct.teacher_id IS NOT NULL
                 AND ct.is_break = FALSE
             )
             AND ($5::date IS NULL OR t.id NOT IN (
               SELECT lr.teacher_id
               FROM leave_requests lr
               WHERE lr.school_id = $1
                 AND lr.status = 'approved'
                 AND $5::date BETWEEN lr.start_date::date AND lr.end_date::date
             ))
           ORDER BY t.name`,
          [school_id, exclude_teacher ? parseInt(exclude_teacher) : null, day, parseInt(period), date || null]
        )
        return NextResponse.json(result.rows)
      }

      // Substitutes for a leave request
      if (leave_request_id) {
        const result = await pool.query(
          `SELECT sa.*,
                  ot.name AS original_teacher_name,
                  ot.department AS original_teacher_department,
                  st.name AS substitute_teacher_name,
                  c.grade, c.section
           FROM substitute_assignments sa
           LEFT JOIN teachers ot ON ot.id = sa.original_teacher_id
           LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id
           LEFT JOIN classes c ON c.id = sa.class_id
           WHERE sa.school_id = $1 AND sa.leave_request_id = $2
           ORDER BY sa.date, sa.period_number`,
          [school_id, leave_request_id]
        )
        return NextResponse.json(result.rows)
      }

      // Substitutes active on a given date
      if (date) {
        const result = await pool.query(
          `SELECT sa.*,
                  ot.name AS original_teacher_name,
                  ot.department AS original_teacher_department,
                  st.name AS substitute_teacher_name,
                  c.grade, c.section
           FROM substitute_assignments sa
           LEFT JOIN teachers ot ON ot.id = sa.original_teacher_id
           LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id
           LEFT JOIN classes c ON c.id = sa.class_id
           WHERE sa.school_id = $1 AND sa.date = $2
           ORDER BY sa.period_number`,
          [school_id, date]
        )
        return NextResponse.json(result.rows)
      }

      return NextResponse.json({ error: 'Provide leave_request_id, date, or day+period' }, { status: 400 })
    } catch (error) {
      console.error('[substitutes GET]', error)
      return NextResponse.json({ error: 'Failed to fetch substitutes' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Emergency Cover (#140) removed the admin assignment workflow — the
// POST (save an assignment) and DELETE (remove one) handlers that used to
// live here were deleted along with app/school-admin/components/EmergencyCover.tsx,
// their only caller. GET is kept: it's a read-only query against
// substitute_assignments (a table that still exists — see lib/db.ts) and
// is still relied on by the protected Attendance dashboard
// (AttendanceDashboard.tsx) plus a few teacher-side views (FullTimetable,
// SmartSnapshot, TeachersManagement) that show already-assigned substitute
// duties. With no writer left, it will simply always return an empty list
// going forward.
