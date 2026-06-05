import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'
import { getAnySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureDB()

    const { searchParams } = new URL(req.url)
    const school_id           = searchParams.get('school_id')
    const class_id            = searchParams.get('class_id')
    const teacher_id          = searchParams.get('teacher_id')
    const date                = searchParams.get('date')
    const day_of_week_filter   = searchParams.get('day_of_week')
    const period_number_filter = searchParams.get('period_number')
    // template_id: 'default' → IS NULL (school default), numeric → specific template, absent → no filter
    const template_id_param   = searchParams.get('template_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // Only serve from cache for full structural fetches (no slot-level or date filters)
    if (!date && !day_of_week_filter && !period_number_filter) {
      const cacheKey = class_id
        ? `timetable:class:${class_id}:tmpl:${template_id_param ?? 'all'}`
        : teacher_id
          ? `timetable:teacher:${teacher_id}:school:${school_id}:tmpl:${template_id_param ?? 'all'}`
          : `timetable:school:${school_id}:tmpl:${template_id_param ?? 'all'}`
      const cached = getCache(cacheKey)
      if (cached) return NextResponse.json(cached)
    }

    try {
      const vals: (string | number | null)[] = [school_id]

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

      let whereClause = ` WHERE ct.school_id = $1`
      if (class_id)             { whereClause += ` AND ct.class_id = $${vals.length + 1}`;      vals.push(class_id) }
      if (teacher_id)           { whereClause += ` AND ct.teacher_id = $${vals.length + 1}`;    vals.push(teacher_id) }
      if (day_of_week_filter)   { whereClause += ` AND ct.day_of_week = $${vals.length + 1}`;   vals.push(day_of_week_filter) }
      if (period_number_filter) { whereClause += ` AND ct.period_number = $${vals.length + 1}`; vals.push(period_number_filter) }

      // Template scoping — each template is independent; NULL = school default
      if (template_id_param === 'default') {
        whereClause += ` AND ct.template_id IS NULL`
      } else if (template_id_param !== null) {
        whereClause += ` AND ct.template_id = $${vals.length + 1}`
        vals.push(parseInt(template_id_param))
      }
      // else: no template filter → return all (used by health, teacher schedules, etc.)

      // has_conflict: teacher double-booked within the SAME template only
      const conflictCheck = `
        CASE
          WHEN ct.teacher_id IS NOT NULL AND ct.is_break = FALSE AND EXISTS (
            SELECT 1 FROM class_timetable cx
            WHERE cx.school_id     = ct.school_id
              AND cx.teacher_id    = ct.teacher_id
              AND cx.day_of_week   = ct.day_of_week
              AND cx.period_number = ct.period_number
              AND cx.class_id     != ct.class_id
              AND cx.is_break      = FALSE
              AND cx.template_id IS NOT DISTINCT FROM ct.template_id
          ) THEN TRUE ELSE FALSE
        END AS has_conflict`

      const q = `SELECT ct.*, t.name AS teacher_name, t.employee_id, c.grade, c.section, ${conflictCheck}${selectExtra}
               ${fromClause}${whereClause}
               ORDER BY CASE ct.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, ct.period_number`

      const result = await pool.query(q, vals)

      // Cache only if no slot-level or date filters
      if (!date && !day_of_week_filter && !period_number_filter) {
        const cacheKey = class_id
          ? `timetable:class:${class_id}:tmpl:${template_id_param ?? 'all'}`
          : teacher_id
            ? `timetable:teacher:${teacher_id}:school:${school_id}:tmpl:${template_id_param ?? 'all'}`
            : `timetable:school:${school_id}:tmpl:${template_id_param ?? 'all'}`
        setCache(cacheKey, result.rows, 30_000)
      }

      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch class timetable' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()

    // Direct slot update by id (e.g. from add-subject flow)
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

    const { class_id, school_id, day_of_week, period_number, teacher_id, apply_to_subject, subject_name, template_id } = body
    if (!class_id || !school_id) {
      return NextResponse.json({ error: 'class_id, school_id required' }, { status: 400 })
    }

    // Build template WHERE fragment (safe: template_id is either null or a validated integer from the client)
    const tmplWhere = template_id != null
      ? `AND template_id = ${parseInt(String(template_id))}`
      : `AND template_id IS NULL`

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [cls] } = await client.query('SELECT grade, section FROM classes WHERE id=$1', [class_id])

      if (apply_to_subject && subject_name) {
        const { rows: updatedSlots } = await client.query(
          `UPDATE class_timetable
           SET teacher_id=$1, is_manual=TRUE, source='manual'
           WHERE class_id=$2 AND school_id=$3 AND subject_name=$4 ${tmplWhere}
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
        invalidateCache(`timetable:class:${class_id}`)
        invalidateCache(`timetable:school:${school_id}`)
        invalidateCache(`health:${school_id}`)
        return NextResponse.json({ updated: updatedSlots.length, subject_name })
      }

      if (!day_of_week || period_number == null) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'day_of_week and period_number required for single slot update' }, { status: 400 })
      }

      const result = await client.query(
        `UPDATE class_timetable
         SET teacher_id=$1, is_manual=TRUE, source='manual'
         WHERE class_id=$2 AND school_id=$3 AND day_of_week=$4 AND period_number=$5 ${tmplWhere}
         RETURNING *`,
        [teacher_id || null, class_id, school_id, day_of_week, period_number]
      )
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
      }
      await client.query('COMMIT')
      invalidateCache(`timetable:class:${class_id}`)
      invalidateCache(`timetable:school:${school_id}`)
      invalidateCache(`health:${school_id}`)

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
  try {
    const { searchParams } = new URL(req.url)
    const school_id         = searchParams.get('school_id')
    const class_id          = searchParams.get('class_id')
    const template_id_param = searchParams.get('template_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // Build template fragment
    const isDefault = template_id_param === 'default' || template_id_param === null
    const tmplWhere = isDefault
      ? `AND template_id IS NULL`
      : `AND template_id = ${parseInt(template_id_param!)}`

    try {
      if (class_id) {
        await pool.query(
          `DELETE FROM class_timetable WHERE class_id=$1 AND school_id=$2 ${tmplWhere}`,
          [class_id, school_id]
        )
        // Clear timetable_generated_at only when deleting the school-default timetable
        if (isDefault) {
          await pool.query(
            'UPDATE classes SET timetable_generated_at=NULL, timetable_circulated_at=NULL WHERE id=$1 AND school_id=$2',
            [class_id, school_id]
          )
        }
        invalidateCache(`timetable:class:${class_id}`)
      } else {
        await pool.query(
          `DELETE FROM class_timetable WHERE school_id=$1 ${tmplWhere}`,
          [school_id]
        )
        if (isDefault) {
          await pool.query(
            'UPDATE classes SET timetable_generated_at=NULL, timetable_circulated_at=NULL WHERE school_id=$1',
            [school_id]
          )
        }
      }
      invalidateCache(`timetable:school:${school_id}`)
      invalidateCache(`health:${school_id}`)
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to delete timetable' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
