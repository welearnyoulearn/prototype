import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-timetable/swap
//
// Swaps two academic period slots within a class timetable.
// Validates no teacher conflict arises after the swap.
// Updates both class_timetable and teacher timetable.
//
// Body: {
//   school_id: number,
//   class_id:  number,
//   slot_a: { day: string, period_number: number },
//   slot_b: { day: string, period_number: number },
// }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  await ensureDB()
  const body = await req.json()
  const { school_id, class_id, slot_a, slot_b } = body

  if (!school_id || !class_id || !slot_a || !slot_b) {
    return NextResponse.json({ error: 'school_id, class_id, slot_a, slot_b required' }, { status: 400 })
  }
  if (slot_a.day === slot_b.day && slot_a.period_number === slot_b.period_number) {
    return NextResponse.json({ error: 'Cannot swap a slot with itself' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Fetch both slots
    const { rows: slots } = await client.query(
      `SELECT id, day_of_week, period_number, subject_name, teacher_id, room, time_from, time_to, is_break
       FROM class_timetable
       WHERE class_id=$1
         AND (
           (day_of_week=$2 AND period_number=$3) OR
           (day_of_week=$4 AND period_number=$5)
         )`,
      [class_id, slot_a.day, slot_a.period_number, slot_b.day, slot_b.period_number]
    )

    const rowA = slots.find(s => s.day_of_week === slot_a.day && Math.round(Number(s.period_number)) === slot_a.period_number)
    const rowB = slots.find(s => s.day_of_week === slot_b.day && Math.round(Number(s.period_number)) === slot_b.period_number)

    if (!rowA || !rowB) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'One or both slots not found' }, { status: 404 })
    }
    if (rowA.is_break || rowB.is_break) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Cannot swap break slots' }, { status: 400 })
    }

    // ── Conflict check ─────────────────────────────────────────────────────
    // After swap: teacher from A would be in slot_b's day+period, and vice versa.
    // Check that neither teacher is already busy in the new slot (in another class).
    const conflicts: string[] = []

    if (rowA.teacher_id) {
      const { rows: conflict } = await client.query(
        `SELECT ct.id FROM class_timetable ct
         WHERE ct.school_id=$1 AND ct.teacher_id=$2
           AND ct.day_of_week=$3 AND ct.period_number=$4
           AND ct.class_id != $5`,
        [school_id, rowA.teacher_id, slot_b.day, slot_b.period_number, class_id]
      )
      if (conflict.length > 0) {
        const { rows: [t] } = await client.query('SELECT name FROM teachers WHERE id=$1', [rowA.teacher_id])
        conflicts.push(`${t?.name ?? 'Teacher A'} is already teaching another class at ${slot_b.day} P${slot_b.period_number}`)
      }
    }

    if (rowB.teacher_id) {
      const { rows: conflict } = await client.query(
        `SELECT ct.id FROM class_timetable ct
         WHERE ct.school_id=$1 AND ct.teacher_id=$2
           AND ct.day_of_week=$3 AND ct.period_number=$4
           AND ct.class_id != $5`,
        [school_id, rowB.teacher_id, slot_a.day, slot_a.period_number, class_id]
      )
      if (conflict.length > 0) {
        const { rows: [t] } = await client.query('SELECT name FROM teachers WHERE id=$1', [rowB.teacher_id])
        conflicts.push(`${t?.name ?? 'Teacher B'} is already teaching another class at ${slot_a.day} P${slot_a.period_number}`)
      }
    }

    if (conflicts.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Swap blocked: teacher conflict', conflicts }, { status: 409 })
    }

    // ── Perform swap in class_timetable ────────────────────────────────────
    // We swap subject_name, teacher_id, room — the day/period/time stays in place
    await client.query(
      `UPDATE class_timetable
       SET subject_name=$1, teacher_id=$2, room=$3
       WHERE class_id=$4 AND day_of_week=$5 AND period_number=$6`,
      [rowB.subject_name, rowB.teacher_id, rowB.room, class_id, slot_a.day, slot_a.period_number]
    )
    await client.query(
      `UPDATE class_timetable
       SET subject_name=$1, teacher_id=$2, room=$3
       WHERE class_id=$4 AND day_of_week=$5 AND period_number=$6`,
      [rowA.subject_name, rowA.teacher_id, rowA.room, class_id, slot_b.day, slot_b.period_number]
    )

    // Mark swapped slots as manually set — preserves them during future regeneration
    await client.query(
      `UPDATE class_timetable SET is_manual=TRUE, source='manual'
       WHERE class_id=$1 AND ((day_of_week=$2 AND period_number=$3) OR (day_of_week=$4 AND period_number=$5))`,
      [class_id, slot_a.day, slot_a.period_number, slot_b.day, slot_b.period_number]
    )

    const { rows: [cls] } = await client.query('SELECT grade, section FROM classes WHERE id=$1', [class_id])

    await client.query('COMMIT')

    // Notify both affected teachers + all class students
    await notifyTimetableChange(pool, {
      school_id: Number(school_id), class_id: Number(class_id),
      grade: cls?.grade, section: cls?.section,
      teacher_ids: [rowA.teacher_id, rowB.teacher_id],
      title: 'Timetable Updated',
      message: `Period slots have been swapped in your timetable for Grade ${cls?.grade}-${cls?.section}.`,
    })
    return NextResponse.json({ success: true, message: 'Slots swapped successfully' })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('POST /api/class-timetable/swap error:', err)
    return NextResponse.json({ error: 'Swap failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
