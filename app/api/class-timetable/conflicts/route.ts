import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/class-timetable/conflicts?school_id=X&template_id=default|N
//
// Returns every cross-class teacher conflict grouped by (teacher, day, period).
// template_id scopes conflicts to a specific template (null = school default).
// Absent template_id = no filter (returns all templates' conflicts).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const template_id_param = req.nextUrl.searchParams.get('template_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  // Template WHERE fragments
  const tmplWhere = template_id_param === 'default'
    ? `AND ct.template_id IS NULL`
    : template_id_param !== null
      ? `AND ct.template_id = ${parseInt(template_id_param)}`
      : ``
  const existsTmplAnd = template_id_param !== null
    ? `AND cx.template_id IS NOT DISTINCT FROM ct.template_id`
    : ``
  const slotsTmplWhere = template_id_param === 'default'
    ? `AND template_id IS NULL`
    : template_id_param !== null
      ? `AND template_id = ${parseInt(template_id_param)}`
      : ``

  try {
    const { rows: conflictRows } = await pool.query<{
      slot_id: number
      class_id: number
      grade: string
      section: string
      teacher_id: number
      teacher_name: string
      day_of_week: string
      period_number: number
      time_from: string
      time_to: string
      subject_name: string
      is_manual: boolean
    }>(
      `SELECT
         ct.id            AS slot_id,
         ct.class_id,
         c.grade,
         c.section,
         ct.teacher_id,
         t.name           AS teacher_name,
         ct.day_of_week,
         ct.period_number::int,
         ct.time_from,
         ct.time_to,
         COALESCE(ct.subject_name, '')  AS subject_name,
         ct.is_manual
       FROM class_timetable ct
       JOIN classes  c ON c.id  = ct.class_id
       JOIN teachers t ON t.id  = ct.teacher_id
       WHERE ct.school_id     = $1
         AND ct.teacher_id IS NOT NULL
         AND ct.is_break       = FALSE
         ${tmplWhere}
         AND EXISTS (
           SELECT 1 FROM class_timetable cx
           WHERE cx.school_id     = ct.school_id
             AND cx.teacher_id    = ct.teacher_id
             AND cx.day_of_week   = ct.day_of_week
             AND cx.period_number = ct.period_number
             AND cx.class_id     != ct.class_id
             AND cx.is_break      = FALSE
             ${existsTmplAnd}
         )
       ORDER BY ct.day_of_week, ct.period_number, ct.teacher_id, c.grade, c.section`,
      [school_id]
    )

    if (conflictRows.length === 0) {
      return NextResponse.json([])
    }

    const groupMap = new Map<string, typeof conflictRows>()
    for (const row of conflictRows) {
      const key = `${row.teacher_id}::${row.day_of_week}::${row.period_number}`
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(row)
    }

    const { rows: allTeachers } = await pool.query<{
      id: number; name: string; subject: string; teaches_grades: string | null
    }>(
      `SELECT id, name, subject, teaches_grades
       FROM teachers
       WHERE school_id=$1 AND staff_type='teaching' AND status='active'
         AND subject IS NOT NULL AND subject != ''`,
      [school_id]
    )

    // Build busy map scoped to the same template
    const { rows: allSlots } = await pool.query<{
      teacher_id: number; day_of_week: string; period_number: number
    }>(
      `SELECT teacher_id, day_of_week, period_number::int
       FROM class_timetable
       WHERE school_id=$1 AND teacher_id IS NOT NULL AND is_break=FALSE
         ${slotsTmplWhere}`,
      [school_id]
    )
    const busyMap: Record<number, Set<string>> = {}
    for (const s of allSlots) {
      if (!busyMap[s.teacher_id]) busyMap[s.teacher_id] = new Set()
      busyMap[s.teacher_id].add(`${s.day_of_week}-${s.period_number}`)
    }

    const conflicts = Array.from(groupMap.entries()).map(([, slots]) => {
      const first = slots[0]
      const dayPeriodKey = `${first.day_of_week}-${first.period_number}`

      const subjects = [...new Set(slots.map(s => s.subject_name).filter(Boolean))]

      const alternatives = subjects.flatMap(subj => {
        const subKey = subj.toLowerCase()
        return allTeachers
          .filter(t =>
            t.id !== first.teacher_id &&
            t.subject.toLowerCase().includes(subKey) &&
            !busyMap[t.id]?.has(dayPeriodKey)
          )
          .map(t => ({ id: t.id, name: t.name, subject: t.subject }))
      })
      const altMap = new Map(alternatives.map(a => [a.id, a]))

      return {
        teacher_id:   first.teacher_id,
        teacher_name: first.teacher_name,
        day_of_week:  first.day_of_week,
        period_number: first.period_number,
        time_from:    first.time_from,
        time_to:      first.time_to,
        slots: slots.map(s => ({
          slot_id:      s.slot_id,
          class_id:     s.class_id,
          grade:        s.grade,
          section:      s.section,
          subject_name: s.subject_name,
          is_manual:    s.is_manual,
        })),
        alternatives: [...altMap.values()],
      }
    })

    return NextResponse.json(conflicts)
  } catch (error) {
    console.error('[conflicts]', error)
    return NextResponse.json({ error: 'Failed to fetch conflicts' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-timetable/conflicts
// Body: { slot_id, new_teacher_id, school_id }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { slot_id, new_teacher_id, school_id } = await req.json()
    if (!slot_id || !school_id) {
      return NextResponse.json({ error: 'slot_id and school_id required' }, { status: 400 })
    }

    await pool.query(
      `UPDATE class_timetable
       SET teacher_id=$1, is_manual=TRUE, source='manual'
       WHERE id=$2 AND school_id=$3`,
      [new_teacher_id ?? null, slot_id, school_id]
    )

    invalidateCache(`timetable:school:${school_id}`)
    invalidateCache(`health:${school_id}`)

    const { rows } = await pool.query('SELECT class_id FROM class_timetable WHERE id=$1', [slot_id])
    if (rows[0]) invalidateCache(`timetable:class:${rows[0].class_id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[conflicts POST]', error)
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 })
  }
}
