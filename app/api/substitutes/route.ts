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
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

// POST /api/substitutes — save substitute assignments
// Body: { school_id, leave_request_id (null for emergency), original_teacher_id, assignments: [...] }
export async function POST(req: NextRequest) {

  try {
    const { school_id, leave_request_id, original_teacher_id, assignments } = await req.json()
    if (!school_id || !original_teacher_id || !Array.isArray(assignments)) {
      return NextResponse.json({ error: 'school_id, original_teacher_id, assignments required' }, { status: 400 })
    }
    const isEmergency = !leave_request_id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedRows: any[] = []
    for (const a of assignments) {
      if (!a.substitute_teacher_id) continue // skip unassigned periods
      const res = await pool.query(
        `INSERT INTO substitute_assignments
           (school_id, leave_request_id, original_teacher_id, substitute_teacher_id,
            class_id, date, day_of_week, period_number, subject_name, time_from, time_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (class_id, date, period_number)
         DO UPDATE SET substitute_teacher_id = EXCLUDED.substitute_teacher_id
         RETURNING *`,
        [school_id, leave_request_id, original_teacher_id, a.substitute_teacher_id,
         a.class_id, a.date, a.day_of_week, a.period_number,
         a.subject_name || null, a.time_from || null, a.time_to || null]
      )
      savedRows.push(res.rows[0])
    }

    // Send notifications to substitute teachers + class teachers
    if (savedRows.length > 0) {
      const origResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [original_teacher_id])
      const origName = origResult.rows[0]?.name || 'a teacher'

      const classIds = [...new Set(savedRows.map((r) => r.class_id as number))]

      // Class info map
      const classResult = await pool.query('SELECT id, grade, section FROM classes WHERE id = ANY($1)', [classIds])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classMap = new Map<number, { grade: string; section: string }>(classResult.rows.map((c: any) => [c.id, c]))

      // Substitute teacher name map
      const subTeacherIds = [...new Set(savedRows.map((r) => r.substitute_teacher_id as number).filter(Boolean))]
      const subTeacherResult = await pool.query('SELECT id, name FROM teachers WHERE id = ANY($1)', [subTeacherIds])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subTeacherMap = new Map<number, string>(subTeacherResult.rows.map((t: any) => [t.id, t.name]))

      // ── Notify each substitute teacher ──────────────────────────────────
      const coverReason = isEmergency
        ? `Emergency Cover — ${origName} is absent`
        : `Substitute Assignment — Covering for ${origName}`
      const teacherGroups = new Map<number, typeof savedRows>()
      for (const r of savedRows) {
        if (!r.substitute_teacher_id) continue
        if (!teacherGroups.has(r.substitute_teacher_id)) teacherGroups.set(r.substitute_teacher_id, [])
        teacherGroups.get(r.substitute_teacher_id)!.push(r)
      }
      for (const [subTeacherId, periods] of teacherGroups) {
        const lines = periods.map((p) => {
          const cls = classMap.get(p.class_id)
          const clsStr = cls ? `Class ${cls.grade}-${cls.section}` : 'a class'
          const dateStr = p.date?.toString().slice(0, 10) || ''
          const timeStr = p.time_from ? ` · ${p.time_from}–${p.time_to}` : ''
          return `• Period ${p.period_number} (${p.subject_name || 'class'}) — ${clsStr} on ${dateStr}${timeStr}`
        }).join('\n')
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
           VALUES ($1, $2, 'substitute_assigned', $3, $4, $5)`,
          [school_id, subTeacherId,
           coverReason,
           `You have been assigned as substitute teacher:\n${lines}`,
           JSON.stringify({ leave_request_id: leave_request_id || null, original_teacher_id, period_count: periods.length, emergency: isEmergency })]
        ).catch(() => {})
      }

      // ── Notify each class teacher whose class is affected ───────────────
      const classTeacherResult = await pool.query(
        `SELECT c.id AS class_id, c.grade, c.section, t.id AS teacher_id
         FROM classes c
         LEFT JOIN teachers t ON t.id = c.class_teacher_id
         WHERE c.id = ANY($1) AND c.class_teacher_id IS NOT NULL`,
        [classIds]
      )
      for (const ct of classTeacherResult.rows) {
        const periods = savedRows.filter(r => r.class_id === ct.class_id)
        const lines = periods.map((p) => {
          const subName = subTeacherMap.get(p.substitute_teacher_id) || 'a substitute teacher'
          const dateStr = p.date?.toString().slice(0, 10) || ''
          const timeStr = p.time_from ? ` · ${p.time_from}–${p.time_to}` : ''
          return `• Period ${p.period_number} (${p.subject_name || 'class'}) → ${subName} on ${dateStr}${timeStr}`
        }).join('\n')
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
           VALUES ($1, $2, 'substitute_info', $3, $4, $5)`,
          [school_id, ct.teacher_id,
           `Substitute arranged for Class ${ct.grade}-${ct.section}`,
           isEmergency
             ? `${origName} is absent today. Emergency substitutes arranged:\n${lines}\nPlease inform your students.`
             : `${origName} is on approved leave. Substitutes arranged:\n${lines}\nPlease inform your students.`,
           JSON.stringify({ leave_request_id: leave_request_id || null, original_teacher_id, class_id: ct.class_id, emergency: isEmergency })]
        ).catch(() => {})
      }
    }

    return NextResponse.json({ saved: savedRows.length })
  } catch (error) {
    console.error('[substitutes POST]', error)
    return NextResponse.json({ error: 'Failed to save substitutes' }, { status: 500 })
  }
}

// DELETE /api/substitutes?leave_request_id=X&school_id=Y
export async function DELETE(req: NextRequest) {
  try {

    const { searchParams } = req.nextUrl
    const leave_request_id = searchParams.get('leave_request_id')
    const school_id = searchParams.get('school_id')
    if (!leave_request_id || !school_id) {
      return NextResponse.json({ error: 'leave_request_id and school_id required' }, { status: 400 })
    }
    try {
      await pool.query(
        'DELETE FROM substitute_assignments WHERE leave_request_id = $1 AND school_id = $2',
        [leave_request_id, school_id]
      )
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('[substitutes DELETE]', error)
      return NextResponse.json({ error: 'Failed to delete substitutes' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
