import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/class-timetable/teacher-load?school_id=X
//
// Pre-generation analysis: for each teacher, shows their total committed
// periods across all classes, how many classes they teach the same subject in,
// and whether their load is feasible given parallel-section constraints.
//
// Used by the "Check Before Generate" panel in TimetableManagement.

export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    // 1. Fetch school schedule to know periods/day and days/week
    const { rows: [sched] } = await pool.query(
      `SELECT periods_per_day FROM school_schedule_settings WHERE school_id = $1`,
      [school_id]
    )
    const periodsPerDay: number = sched?.periods_per_day ?? 8
    const daysPerWeek = 6 // Mon–Sat
    const totalSlotsPerWeek = periodsPerDay * daysPerWeek

    // 2. Teacher load from class_subjects
    //    For each teacher: total periods/week committed, classes they teach, subjects
    const { rows: loadRows } = await pool.query<{
      teacher_id: number
      teacher_name: string
      subject_name: string
      class_count: number      // how many classes they teach this subject in
      total_periods: number    // sum of periods_per_week across all those classes
      classes: string          // e.g. "3-A, 3-B, 4-A"
    }>(
      `SELECT
         cs.teacher_id,
         t.name                                         AS teacher_name,
         cs.subject_name,
         COUNT(cs.class_id)::int                        AS class_count,
         SUM(cs.periods_per_week)::int                  AS total_periods,
         STRING_AGG(c.grade || '-' || c.section, ', ' ORDER BY c.grade, c.section) AS classes
       FROM class_subjects cs
       JOIN teachers t ON t.id  = cs.teacher_id
       JOIN classes  c ON c.id  = cs.class_id
       WHERE c.school_id  = $1
         AND cs.teacher_id IS NOT NULL
       GROUP BY cs.teacher_id, t.name, cs.subject_name
       ORDER BY SUM(cs.periods_per_week) DESC, t.name`,
      [school_id]
    )

    // 3. Per teacher: total periods across ALL subjects
    const teacherTotals: Record<number, {
      teacher_id: number; teacher_name: string
      total_periods: number
      subjects: typeof loadRows
    }> = {}

    for (const row of loadRows) {
      if (!teacherTotals[row.teacher_id]) {
        teacherTotals[row.teacher_id] = {
          teacher_id: row.teacher_id,
          teacher_name: row.teacher_name,
          total_periods: 0,
          subjects: [],
        }
      }
      teacherTotals[row.teacher_id].total_periods += row.total_periods
      teacherTotals[row.teacher_id].subjects.push(row)
    }

    // 4. Build risk analysis for each teacher+subject combo
    //    Risk = class_count > 1 (same teacher, same subject, multiple classes)
    //    A teacher teaching subject X in N parallel classes needs N different
    //    time slots for X — impossible if N > total available slots for that teacher.
    const result = Object.values(teacherTotals).map(teacher => {
      const risky = teacher.subjects.filter(s => s.class_count > 1)
      const overloaded = teacher.total_periods > totalSlotsPerWeek

      // For each multi-class subject: the minimum periods needed (class_count × periods_per_class)
      // must fit in the teacher's available slots. Rough conflict probability:
      // If teacher teaches same subject in 3 classes × 4 periods = 12 of their slots
      // must all be at different day-period combos → always possible in theory.
      // But when combined with other subjects, slot exhaustion causes conflicts.

      const risk: 'high' | 'medium' | 'low' =
        overloaded ? 'high' :
        risky.some(s => s.class_count >= 3) ? 'high' :
        risky.some(s => s.class_count === 2) ? 'medium' :
        'low'

      return {
        teacher_id: teacher.teacher_id,
        teacher_name: teacher.teacher_name,
        total_periods: teacher.total_periods,
        total_slots_available: totalSlotsPerWeek,
        overloaded,
        risk,
        subjects: teacher.subjects.map(s => ({
          subject_name: s.subject_name,
          class_count: s.class_count,
          total_periods: s.total_periods,
          classes: s.classes,
          // parallel conflict risk: same teacher, same subject, multiple classes
          parallel_risk: s.class_count > 1,
        })),
      }
    })

    // Sort: high risk first
    const riskOrder = { high: 0, medium: 1, low: 2 }
    result.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk] || b.total_periods - a.total_periods)

    return NextResponse.json({
      teachers: result,
      summary: {
        total_teachers: result.length,
        high_risk: result.filter(r => r.risk === 'high').length,
        medium_risk: result.filter(r => r.risk === 'medium').length,
        low_risk: result.filter(r => r.risk === 'low').length,
        periods_per_day: periodsPerDay,
        days_per_week: daysPerWeek,
      },
    })
  } catch (error) {
    console.error('[teacher-load]', error)
    return NextResponse.json({ error: 'Failed to analyse teacher load' }, { status: 500 })
  }
}
