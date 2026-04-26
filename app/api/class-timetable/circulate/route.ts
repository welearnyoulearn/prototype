import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'
import { invalidateCache } from '@/lib/responseCache'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-timetable/circulate
//
// Publishes the current timetable and notifies affected teachers + students.
//
// Body: { school_id, class_id?, template_id? }
//
//   template_id — null/absent = school default template
//                 number      = specific named template
//
// When class_id is omitted (school-wide):
//   - If a template_id is supplied, circulates all classes whose timetable uses
//     that template.
//   - If template_id is also absent, circulates the school-default timetable for
//     all classes and uses a time-overlap conflict check (handles classes that
//     were generated from different templates with different period timings).
//
// Conflict handling:
//   - Within-template (same period_number = same time): blocked by GROUP BY count.
//   - Cross-template school-wide: blocked by time-overlap (time_from < ct2.time_to
//     AND time_to > ct2.time_from) on the same teacher+day across different templates.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  try {
    const { school_id, class_id, template_id = null } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const tmplVal = template_id != null ? parseInt(String(template_id)) : null

    // Build template WHERE fragments
    const tmplWhere = tmplVal !== null
      ? `AND ct.template_id = ${tmplVal}`
      : `AND ct.template_id IS NULL`

    // ── Conflict check ────────────────────────────────────────────────────────
    let conflictCount = 0

    if (class_id) {
      // Single-class: only within-template period conflicts matter
      const { rows: conflicts } = await pool.query(
        `SELECT ct.teacher_id, ct.day_of_week, ct.period_number, COUNT(*) AS cnt
         FROM class_timetable ct
         WHERE ct.school_id=$1 AND ct.class_id=$2
           AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
           ${tmplWhere}
         GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
         HAVING COUNT(*) > 1`,
        [school_id, class_id]
      )
      conflictCount = conflicts.length
    } else if (tmplVal !== null) {
      // School-wide, specific template: within-template period conflicts
      const { rows: conflicts } = await pool.query(
        `SELECT ct.teacher_id, ct.day_of_week, ct.period_number, COUNT(*) AS cnt
         FROM class_timetable ct
         WHERE ct.school_id=$1
           AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
           ${tmplWhere}
         GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
         HAVING COUNT(*) > 1`,
        [school_id]
      )
      conflictCount = conflicts.length
    } else {
      // School-wide, school-default template:
      // Use time-overlap check because different classes may use different templates
      // with different period timings — period_number equality is not reliable here.
      const { rows: overlapRows } = await pool.query(
        `SELECT COUNT(DISTINCT ct.id) AS cnt
         FROM class_timetable ct
         WHERE ct.school_id = $1
           AND ct.teacher_id IS NOT NULL
           AND ct.is_break = FALSE
           AND ct.template_id IS NULL
           AND EXISTS (
             SELECT 1 FROM class_timetable cx
             WHERE cx.school_id     = ct.school_id
               AND cx.teacher_id    = ct.teacher_id
               AND cx.day_of_week   = ct.day_of_week
               AND cx.class_id     != ct.class_id
               AND cx.is_break      = FALSE
               AND cx.time_from < ct.time_to
               AND cx.time_to   > ct.time_from
           )`,
        [school_id]
      )
      conflictCount = parseInt(overlapRows[0]?.cnt ?? '0')
    }

    if (conflictCount > 0) {
      return NextResponse.json({
        error: `Cannot circulate: ${conflictCount} teacher conflict(s) exist. Resolve all conflicts first.`,
        conflict_count: conflictCount,
      }, { status: 409 })
    }

    // ── Fetch classes to circulate ────────────────────────────────────────────
    const classVals: (number | string)[] = [school_id]
    const classExtra = class_id ? (classVals.push(class_id), `AND ct.class_id=$2`) : ``

    const { rows: classes } = await pool.query(
      `SELECT DISTINCT ct.class_id, c.grade, c.section
       FROM class_timetable ct
       JOIN classes c ON c.id = ct.class_id
       WHERE ct.school_id=$1 AND ct.is_break=FALSE
         ${tmplWhere}
         ${classExtra}`,
      classVals
    )

    if (classes.length === 0) {
      return NextResponse.json({ error: 'No timetable data found to circulate' }, { status: 400 })
    }

    // ── Stamp circulation time + send notifications ───────────────────────────
    const circulatedAt = new Date().toISOString()
    let totalNotified = 0
    for (const cls of classes) {
      await pool.query(
        `UPDATE classes SET timetable_circulated_at = NOW() WHERE id = $1`,
        [cls.class_id]
      )
      const { rows: teacherRows } = await pool.query(
        `SELECT DISTINCT ct.teacher_id FROM class_timetable ct
         WHERE ct.class_id=$1 AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
           ${tmplWhere}`,
        [cls.class_id]
      )
      await notifyTimetableChange(pool, {
        school_id: Number(school_id),
        class_id: cls.class_id,
        grade: cls.grade,
        section: cls.section,
        teacher_ids: teacherRows.map((r: { teacher_id: number }) => r.teacher_id),
        title: 'Timetable Published',
        message: `Your timetable for Grade ${cls.grade}-${cls.section} has been updated and published.`,
      })
      totalNotified += teacherRows.length
    }

    invalidateCache(`classes:${school_id}`)
    invalidateCache(`timetable:school:${school_id}`)
    invalidateCache(`health:${school_id}`)
    if (class_id) invalidateCache(`timetable:class:${class_id}`)

    return NextResponse.json({
      success: true,
      classes_circulated: classes.length,
      staff_notified: totalNotified,
      circulated_at: circulatedAt,
    })
  } catch (error) {
    console.error('[circulate]', error)
    return NextResponse.json({ error: 'Failed to circulate timetable' }, { status: 500 })
  }
}
