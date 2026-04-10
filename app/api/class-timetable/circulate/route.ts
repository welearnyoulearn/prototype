import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'
import { invalidateCache } from '@/lib/responseCache'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-timetable/circulate
//
// Publishes the current timetable state and notifies all affected teachers
// and students. Blocks if any teacher-conflict slots exist.
//
// Body: { school_id, class_id? }
//   class_id — optional; if omitted, circulates all classes in the school
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  try {
    const { school_id, class_id } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // ── Conflict check ────────────────────────────────────────────────────────
    // Find teacher slots where the same teacher is in 2+ classes simultaneously
    const conflictQ = class_id
      ? `SELECT ct.teacher_id, ct.day_of_week, ct.period_number, COUNT(*) AS cnt
         FROM class_timetable ct
         WHERE ct.school_id=$1 AND ct.class_id=$2
           AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
         GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
         HAVING COUNT(*) > 1`
      : `SELECT ct.teacher_id, ct.day_of_week, ct.period_number, COUNT(*) AS cnt
         FROM class_timetable ct
         WHERE ct.school_id=$1
           AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
         GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
         HAVING COUNT(*) > 1`

    const conflictVals = class_id ? [school_id, class_id] : [school_id]
    const { rows: conflicts } = await pool.query(conflictQ, conflictVals)

    if (conflicts.length > 0) {
      return NextResponse.json({
        error: `Cannot circulate: ${conflicts.length} teacher conflict(s) exist. Resolve all conflicts first.`,
        conflict_count: conflicts.length,
      }, { status: 409 })
    }

    // ── Fetch classes to notify ───────────────────────────────────────────────
    const classQ = class_id
      ? `SELECT DISTINCT ct.class_id, c.grade, c.section
         FROM class_timetable ct
         JOIN classes c ON c.id = ct.class_id
         WHERE ct.school_id=$1 AND ct.class_id=$2 AND ct.is_break=FALSE`
      : `SELECT DISTINCT ct.class_id, c.grade, c.section
         FROM class_timetable ct
         JOIN classes c ON c.id = ct.class_id
         WHERE ct.school_id=$1 AND ct.is_break=FALSE`

    const { rows: classes } = await pool.query(classQ, conflictVals)

    if (classes.length === 0) {
      return NextResponse.json({ error: 'No timetable data found to circulate' }, { status: 400 })
    }

    // ── Stamp circulation time + send notifications ───────────────────────────
    const circulatedAt = new Date().toISOString()
    let totalNotified = 0
    for (const cls of classes) {
      // Mark as circulated in classes table
      await pool.query(
        `UPDATE classes SET timetable_circulated_at = NOW() WHERE id = $1`,
        [cls.class_id]
      )
      const { rows: teacherRows } = await pool.query(
        `SELECT DISTINCT teacher_id FROM class_timetable
         WHERE class_id=$1 AND teacher_id IS NOT NULL AND is_break=FALSE`,
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
