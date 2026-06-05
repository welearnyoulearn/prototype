import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'

export async function GET(req: NextRequest) {
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
}

export async function PUT(req: NextRequest) {
  await ensureDB()
  try {
    const body = await req.json()

    let classId = body.class_id
    let schoolId = body.school_id
    let dayOfWeek = body.day_of_week
    let periodNumber = body.period_number
    let templateId = body.template_id
    let subjectName = body.subject_name
    let teacherId = body.teacher_id
    let room = body.room
    let timeFrom = body.time_from
    let timeTo = body.time_to

    let existingSlot = null
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Look up existing slot by ID if provided, otherwise by coordinates
      if (body.id) {
        const { rows } = await client.query('SELECT * FROM class_timetable WHERE id = $1', [body.id])
        if (rows.length > 0) {
          existingSlot = rows[0]
          classId = existingSlot.class_id
          schoolId = existingSlot.school_id
          dayOfWeek = existingSlot.day_of_week
          periodNumber = existingSlot.period_number
          templateId = existingSlot.template_id
        }
      } else if (classId && dayOfWeek && periodNumber !== undefined) {
        const { rows } = await client.query(
          `SELECT * FROM class_timetable 
           WHERE class_id = $1 
             AND day_of_week = $2 
             AND period_number = $3 
             AND (template_id = $4 OR (template_id IS NULL AND $4 IS NULL))`,
          [classId, dayOfWeek, periodNumber, templateId]
        )
        if (rows.length > 0) {
          existingSlot = rows[0]
        }
      }

      // 2. Handle apply_to_subject (bulk update teacher for all periods of a subject)
      if (body.apply_to_subject && subjectName && classId && schoolId) {
        const tmplWhere = templateId != null
          ? `AND template_id = ${parseInt(String(templateId))}`
          : `AND template_id IS NULL`
        const { rows: updatedSlots } = await client.query(
          `UPDATE class_timetable
           SET teacher_id=$1, is_manual=TRUE, source='manual'
           WHERE class_id=$2 AND school_id=$3 AND subject_name=$4 ${tmplWhere}
           RETURNING *`,
          [teacherId || null, classId, schoolId, subjectName]
        )

        const { rows: [cls] } = await client.query('SELECT grade, section, timetable_generated_at FROM classes WHERE id=$1', [classId])
        if (cls?.timetable_generated_at) {
          await notifyTimetableChange(pool, {
            school_id: Number(schoolId), class_id: Number(classId),
            grade: cls.grade, section: cls.section,
            teacher_ids: teacherId ? [Number(teacherId)] : [],
            title: 'Timetable Updated',
            message: `${subjectName} teacher has been updated for Grade ${cls.grade}-${cls.section}.`,
          })
        }

        await client.query('COMMIT')
        invalidateCache(`timetable:class:${classId}`)
        invalidateCache(`timetable:school:${schoolId}`)
        invalidateCache(`health:${schoolId}`)
        return NextResponse.json({ updated: updatedSlots.length, subject_name: subjectName })
      }

      // 3. Single slot update or delete
      if (!classId || !schoolId) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'class_id, school_id required' }, { status: 400 })
      }
      if (!dayOfWeek || periodNumber == null) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'day_of_week and period_number required' }, { status: 400 })
      }

      const pNum = Math.round(Number(periodNumber))
      let resultSlot = null

      const { rows: [cls] } = await client.query('SELECT grade, section, timetable_generated_at FROM classes WHERE id=$1', [classId])

      if (!subjectName || subjectName.trim().toLowerCase() === 'free' || subjectName.trim() === '—' || subjectName.trim() === '') {
        // If subject is empty/free, delete slot from db
        if (existingSlot) {
          await client.query('DELETE FROM class_timetable WHERE id = $1', [existingSlot.id])
        }
        resultSlot = { id: 0, class_id: classId, school_id: schoolId, day_of_week: dayOfWeek, period_number: pNum, subject_name: null, teacher_id: null }
      } else {
        // Upsert
        if (existingSlot) {
          const res = await client.query(
            `UPDATE class_timetable
             SET subject_name = $1,
                 teacher_id = $2,
                 room = COALESCE($3, room),
                 time_from = COALESCE($4, time_from),
                 time_to = COALESCE($5, time_to),
                 is_manual = TRUE,
                 source = 'manual'
             WHERE id = $6 RETURNING *`,
            [subjectName.trim(), teacherId || null, room || null, timeFrom || null, timeTo || null, existingSlot.id]
          )
          resultSlot = res.rows[0]
        } else {
          const res = await client.query(
            `INSERT INTO class_timetable (
               class_id, school_id, day_of_week, period_number, template_id,
               subject_name, teacher_id, room, time_from, time_to, is_manual, source
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'manual')
             RETURNING *`,
            [classId, schoolId, dayOfWeek, pNum, templateId || null, subjectName.trim(), teacherId || null, room || null, timeFrom || null, timeTo || null]
          )
          resultSlot = res.rows[0]
        }
      }

      if (cls?.timetable_generated_at) {
        await notifyTimetableChange(pool, {
          school_id: Number(schoolId), class_id: Number(classId),
          grade: cls.grade, section: cls.section,
          teacher_ids: teacherId ? [Number(teacherId)] : [],
          title: 'Timetable Updated',
          message: `Your timetable has been updated for Grade ${cls.grade}-${cls.section} on ${dayOfWeek}.`,
        })
      }

      await client.query('COMMIT')
      invalidateCache(`timetable:class:${classId}`)
      invalidateCache(`timetable:school:${schoolId}`)
      invalidateCache(`health:${schoolId}`)

      return NextResponse.json(resultSlot)
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
}
