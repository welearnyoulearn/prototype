import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'

export async function GET(req: NextRequest) {
  await ensureDB()
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  const teacher_id = searchParams.get('teacher_id')
  const date = searchParams.get('date')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const vals: (string | number)[] = [school_id]

    const selectExtra = date
      ? `, sa.substitute_teacher_id, st.name AS substitute_teacher_name, sa.id AS substitute_assignment_id, st.subject AS substitute_teacher_subject, st.department AS substitute_teacher_department`
      : ''

    let fromClause = `FROM class_timetable ct LEFT JOIN teachers t ON ct.teacher_id = t.id LEFT JOIN classes c ON c.id = ct.class_id`
    if (date) {
      vals.push(date)
      fromClause += `
             LEFT JOIN substitute_assignments sa
               ON sa.class_id = ct.class_id
              AND sa.period_number = ct.period_number
              AND sa.school_id = ct.school_id
              AND sa.date = $2
             LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id`
    }

    const day_of_week_param = searchParams.get('day_of_week')
    const period_number_param = searchParams.get('period_number')

    let whereClause = ` WHERE ct.school_id = $1`
    if (class_id)          { whereClause += ` AND ct.class_id = $${vals.length + 1}`;       vals.push(class_id) }
    if (teacher_id)        { whereClause += ` AND ct.teacher_id = $${vals.length + 1}`;     vals.push(teacher_id) }
    if (day_of_week_param) { whereClause += ` AND ct.day_of_week = $${vals.length + 1}`;    vals.push(day_of_week_param) }
    if (period_number_param){ whereClause += ` AND ct.period_number = $${vals.length + 1}`; vals.push(period_number_param) }

    // has_conflict: TRUE when this teacher is simultaneously assigned to another class at the same slot
    const conflictCheck = `
      CASE
        WHEN ct.teacher_id IS NOT NULL AND ct.is_break = FALSE AND EXISTS (
          SELECT 1 FROM class_timetable cx
          WHERE cx.school_id = ct.school_id
            AND cx.teacher_id = ct.teacher_id
            AND cx.day_of_week = ct.day_of_week
            AND cx.period_number = ct.period_number
            AND cx.class_id != ct.class_id
            AND cx.is_break = FALSE
        ) THEN TRUE ELSE FALSE
      END AS has_conflict`

    const q = `SELECT ct.*, t.name AS teacher_name, t.employee_id, c.grade, c.section, ${conflictCheck}${selectExtra}
             ${fromClause}${whereClause}
             ORDER BY CASE ct.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, ct.period_number`

    const result = await pool.query(q, vals)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch class timetable' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.id) {
      const { id, subject_name, teacher_id, room, time_from, time_to } = body
      const result = await pool.query(
        `UPDATE class_timetable
         SET subject_name=$1, teacher_id=$2,
             room=COALESCE($3, room),
             time_from=COALESCE($4, time_from),
             time_to=COALESCE($5, time_to),
             is_manual=TRUE, source='manual'
         WHERE id=$6 RETURNING *`,
        [subject_name || null, teacher_id || null, room, time_from, time_to, id]
      )
      return NextResponse.json(result.rows[0])
    }

    const { class_id, school_id, day_of_week, period_number, teacher_id, apply_to_subject, subject_name } = body
    if (!class_id || !school_id) {
      return NextResponse.json({ error: 'class_id, school_id required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [cls] } = await client.query('SELECT grade, section FROM classes WHERE id=$1', [class_id])

      if (apply_to_subject && subject_name) {
        const { rows: updatedSlots } = await client.query(
          `UPDATE class_timetable
           SET teacher_id=$1, is_manual=TRUE, source='manual'
           WHERE class_id=$2 AND school_id=$3 AND subject_name=$4
           RETURNING *`,
          [teacher_id || null, class_id, school_id, subject_name]
        )
        await client.query('COMMIT')

        const { rows: [clsInfo] } = await pool.query(
          'SELECT grade, section, timetable_generated_at FROM classes WHERE id=$1', [class_id]
        )
        if (clsInfo?.timetable_generated_at) {
          await notifyTimetableChange(pool, {
            school_id: Number(school_id), class_id: Number(class_id),
            grade: clsInfo.grade, section: clsInfo.section,
            teacher_ids: teacher_id ? [Number(teacher_id)] : [],
            title: 'Timetable Updated',
            message: `${subject_name} teacher has been updated for Grade ${clsInfo.grade}-${clsInfo.section}.`,
          })
        }
        return NextResponse.json({ updated: updatedSlots.length, subject_name })
      }

      if (!day_of_week || period_number == null) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'day_of_week and period_number required for single slot update' }, { status: 400 })
      }

      const result = await client.query(
        `UPDATE class_timetable
         SET teacher_id=$1, is_manual=TRUE, source='manual'
         WHERE class_id=$2 AND school_id=$3 AND day_of_week=$4 AND period_number=$5
         RETURNING *`,
        [teacher_id || null, class_id, school_id, day_of_week, period_number]
      )
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
      }
      await client.query('COMMIT')

      const { rows: [clsPublished] } = await pool.query(
        'SELECT timetable_generated_at FROM classes WHERE id=$1', [class_id]
      )
      if (clsPublished?.timetable_generated_at) {
        await notifyTimetableChange(pool, {
          school_id: Number(school_id), class_id: Number(class_id),
          grade: cls?.grade, section: cls?.section,
          teacher_ids: teacher_id ? [Number(teacher_id)] : [],
          title: 'Timetable Updated',
          message: `Your timetable has been updated for Grade ${cls?.grade}-${cls?.section} on ${day_of_week}.`,
        })
      }
      return NextResponse.json(result.rows[0])
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { school_id, period_number, time_from, time_to } = await req.json()
    if (!school_id || period_number == null || !time_from || !time_to) {
      return NextResponse.json({ error: 'school_id, period_number, time_from, time_to required' }, { status: 400 })
    }
    await ensureDB()
    await pool.query(
      'UPDATE class_timetable SET time_from=$1, time_to=$2 WHERE school_id=$3 AND period_number=$4',
      [time_from, time_to, school_id, period_number]
    )
    return NextResponse.json({ updated: true, period_number, time_from, time_to })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update timing' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    if (class_id) {
      await pool.query('DELETE FROM class_timetable WHERE class_id=$1 AND school_id=$2', [class_id, school_id])
    } else {
      await pool.query('DELETE FROM class_timetable WHERE school_id=$1', [school_id])
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete timetable' }, { status: 500 })
  }
}
