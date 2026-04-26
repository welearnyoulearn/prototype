import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getCache, setCache } from '@/lib/responseCache'

// GET /api/class-timetable/health?school_id=X
//
// Returns per-class health stats in one query — used by the timetable sidebar
// to show quick visual indicators without the admin having to click into each class.
//
// Per class:
//   conflict_count      – slots where the assigned teacher is simultaneously in another class
//   no_teacher_count    – academic slots that have a subject but no teacher
//   subjects_unassigned – subjects in class_subjects that have NO timetable slot with a teacher
//                         (fix: was counting class_subjects.teacher_id IS NULL which stayed NULL
//                          even after auto-generation filled timetable slots with teachers)
//   timetable_exists    – whether any timetable rows exist for this class
export async function GET(req: NextRequest) {

  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const cacheKey = `health:${school_id}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const { rows } = await pool.query(
      `WITH conflict_slots AS (
         SELECT ct.class_id, COUNT(*)::int AS conflict_count
         FROM class_timetable ct
         WHERE ct.school_id = $1
           AND ct.teacher_id IS NOT NULL
           AND ct.is_break = FALSE
           AND EXISTS (
             SELECT 1 FROM class_timetable cx
             WHERE cx.school_id  = ct.school_id
               AND cx.teacher_id = ct.teacher_id
               AND cx.day_of_week   = ct.day_of_week
               AND cx.period_number = ct.period_number
               AND cx.class_id  != ct.class_id
               AND cx.is_break  = FALSE
               AND cx.template_id IS NOT DISTINCT FROM ct.template_id
           )
         GROUP BY ct.class_id
       ),
       no_teacher_slots AS (
         SELECT ct.class_id, COUNT(*)::int AS no_teacher_count
         FROM class_timetable ct
         WHERE ct.school_id    = $1
           AND ct.subject_name IS NOT NULL
           AND ct.teacher_id   IS NULL
           AND ct.is_break     = FALSE
         GROUP BY ct.class_id
       ),
       subj_unassigned AS (
         -- A subject is "unassigned" only if NONE of its timetable slots have a teacher.
         -- Fixes the bug where class_subjects.teacher_id stayed NULL even after timetable
         -- generation filled the actual period slots with teachers.
         SELECT cs.class_id, COUNT(*)::int AS subjects_unassigned
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
         WHERE c.school_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM class_timetable ct
             WHERE ct.class_id    = cs.class_id
               AND ct.subject_name = cs.subject_name
               AND ct.teacher_id  IS NOT NULL
               AND ct.is_break    = FALSE
           )
         GROUP BY cs.class_id
       ),
       tt_exists AS (
         SELECT class_id, TRUE AS timetable_exists
         FROM class_timetable
         WHERE school_id = $1
         GROUP BY class_id
       )
       SELECT
         c.id                                             AS class_id,
         COALESCE(cf.conflict_count,   0)                AS conflict_count,
         COALESCE(nt.no_teacher_count, 0)                AS no_teacher_count,
         COALESCE(su.subjects_unassigned, 0)             AS subjects_unassigned,
         COALESCE(te.timetable_exists, FALSE)            AS timetable_exists
       FROM classes c
       LEFT JOIN conflict_slots  cf ON cf.class_id = c.id
       LEFT JOIN no_teacher_slots nt ON nt.class_id = c.id
       LEFT JOIN subj_unassigned  su ON su.class_id = c.id
       LEFT JOIN tt_exists        te ON te.class_id = c.id
       WHERE c.school_id = $1
       ORDER BY c.grade, c.section`,
      [school_id]
    )
    setCache(cacheKey, rows, 20_000)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('[class-timetable/health]', error)
    return NextResponse.json({ error: 'Failed to fetch health data' }, { status: 500 })
  }
}
