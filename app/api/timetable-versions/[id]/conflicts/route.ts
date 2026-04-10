import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/timetable-versions/[id]/conflicts?school_id=X
//
// Detects teacher double-booking conflicts across all classes in the school.
// Returns a list of conflicts with affected classes, day, period, and teacher info.
//
// For MASTER classes: any conflict blocks confirmation.
// For INDEPENDENT classes: conflicts are flagged but non-blocking.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  await params // version id available if needed for future version-scoped conflicts
  const school_id = new URL(req.url).searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    // Find all slots where the same teacher is assigned to 2+ classes at the same day+period
    const { rows: conflictRows } = await pool.query(
      `SELECT
         ct.teacher_id,
         t.name AS teacher_name,
         ct.day_of_week,
         ct.period_number,
         ct.time_from,
         ct.time_to,
         json_agg(json_build_object(
           'class_id', ct.class_id,
           'grade', c.grade,
           'section', c.section,
           'subject_name', ct.subject_name,
           'slot_id', ct.id,
           'is_locked', ct.is_locked
         ) ORDER BY c.grade, c.section) AS affected_classes
       FROM class_timetable ct
       JOIN teachers t ON t.id = ct.teacher_id
       JOIN classes c ON c.id = ct.class_id
       WHERE ct.school_id = $1
         AND ct.teacher_id IS NOT NULL
         AND ct.is_break = FALSE
       GROUP BY ct.teacher_id, t.name, ct.day_of_week, ct.period_number, ct.time_from, ct.time_to
       HAVING COUNT(*) > 1
       ORDER BY ct.day_of_week, ct.period_number, t.name`,
      [school_id]
    )

    // Fetch modes for all classes to classify conflicts
    const { rows: modeRows } = await pool.query(
      `SELECT class_id, mode FROM class_timetable_modes WHERE school_id=$1`,
      [school_id]
    )
    const modeMap: Record<number, string> = {}
    for (const r of modeRows) modeMap[r.class_id] = r.mode

    const dayOrder: Record<string, number> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
    }

    const conflicts = conflictRows.map(row => {
      const classes = row.affected_classes as Array<{
        class_id: number; grade: string; section: string; subject_name: string; slot_id: number; is_locked: boolean
      }>

      // Determine severity based on mode of affected classes
      const modes = classes.map(c => modeMap[c.class_id] || 'slave')
      const hasMaster = modes.includes('master')
      const hasIndependent = modes.every(m => m === 'independent')

      // Blocking = involves at least one master or slave class
      const blocking = !hasIndependent

      return {
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        day_of_week: row.day_of_week,
        day_order: dayOrder[row.day_of_week] ?? 7,
        period_number: row.period_number,
        time_from: row.time_from,
        time_to: row.time_to,
        blocking,
        has_master: hasMaster,
        affected_classes: classes.map(c => ({
          ...c,
          mode: modeMap[c.class_id] || 'slave',
        })),
      }
    })

    conflicts.sort((a, b) => a.day_order - b.day_order || a.period_number - b.period_number)

    return NextResponse.json({
      total: conflicts.length,
      blocking: conflicts.filter(c => c.blocking).length,
      non_blocking: conflicts.filter(c => !c.blocking).length,
      conflicts,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to detect conflicts' }, { status: 500 })
  }
}
