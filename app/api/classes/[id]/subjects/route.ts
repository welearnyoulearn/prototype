import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { matchTeacher } from '@/lib/matchTeacher'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params

  const cacheKey = `subjects:class:${id}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const result = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.teacher_id, cs.periods_per_week,
              t.name AS teacher_name
       FROM class_subjects cs
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1
       ORDER BY cs.subject_name`,
      [id]
    )
    setCache(cacheKey, result.rows, 60_000)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  try {
    const { subject_name, teacher_id, periods_per_week } = await req.json()
    if (!subject_name?.trim()) {
      return NextResponse.json({ error: 'subject_name required' }, { status: 400 })
    }
    const ppw = Math.min(12, Math.max(1, parseInt(periods_per_week) || 4))

    // Fetch class info (need school_id + grade for teacher matching)
    const { rows: [cls] } = await pool.query(
      'SELECT school_id, grade, section FROM classes WHERE id = $1', [id]
    )
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    let resolvedTeacherId: number | null = teacher_id ? Number(teacher_id) : null

    // Auto-assign teacher via smart matching if none explicitly provided
    if (!resolvedTeacherId) {
      const { rows: staff } = await pool.query(
        `SELECT id, subject, teaches_grades FROM teachers
         WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
           AND subject IS NOT NULL AND subject != ''`,
        [cls.school_id]
      )
      // Filter by teaches_grades if set
      const eligible = staff.filter(t => {
        if (!t.teaches_grades) return true
        const allowed = t.teaches_grades.split(',').map((g: string) => g.trim().toUpperCase())
        return allowed.includes(cls.grade.toUpperCase())
      })
      resolvedTeacherId = matchTeacher(subject_name.trim(), eligible.length > 0 ? eligible : staff)
    }

    // Insert or update subject assignment
    const result = await pool.query(
      `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, subject_name) DO UPDATE
         SET teacher_id = $3, periods_per_week = $4
       RETURNING *`,
      [id, subject_name.trim(), resolvedTeacherId, ppw]
    )

    // If timetable already exists for this class, propagate teacher assignment (conflict-safe)
    if (resolvedTeacherId) {
      await pool.query(
        `UPDATE class_timetable ct
         SET teacher_id = $1
         WHERE ct.class_id = $2
           AND ct.subject_name = $3
           AND ct.is_break = FALSE
           AND ct.teacher_id IS DISTINCT FROM $1
           AND NOT EXISTS (
             SELECT 1 FROM class_timetable other
             WHERE other.school_id   = ct.school_id
               AND other.class_id   != ct.class_id
               AND other.day_of_week   = ct.day_of_week
               AND other.period_number = ct.period_number
               AND other.teacher_id    = $1
               AND other.is_break = FALSE
           )`,
        [resolvedTeacherId, id, subject_name.trim()]
      )
    }

    const teacherName = resolvedTeacherId
      ? (await pool.query('SELECT name FROM teachers WHERE id = $1', [resolvedTeacherId])).rows[0]?.name ?? null
      : null

    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`timetable:class:${id}`)
    invalidateCache(`health:${cls.school_id}`)

    return NextResponse.json({ ...result.rows[0], teacher_name: teacherName }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to add subject' }, { status: 500 })
  }
}

// PATCH /api/classes/[id]/subjects — edit subject name, teacher, or periods_per_week
// Body: { subject_id, subject_name?, teacher_id?, periods_per_week? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { subject_id, teacher_id, periods_per_week, subject_name } = await req.json()
    if (!subject_id) return NextResponse.json({ error: 'subject_id required' }, { status: 400 })

    const { rows: [sub] } = await pool.query(
      `SELECT cs.subject_name, c.school_id FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id WHERE cs.id = $1 AND cs.class_id = $2`,
      [subject_id, id]
    )
    if (!sub) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const updates: string[] = []
    const values: (string | number | null)[] = []

    const newName = subject_name?.trim() || null
    if (newName && newName !== sub.subject_name) {
      updates.push(`subject_name = $${values.length + 1}`); values.push(newName)
    }
    if (teacher_id !== undefined) {
      const tid = teacher_id ? Number(teacher_id) : null
      updates.push(`teacher_id = $${values.length + 1}`); values.push(tid)
    }
    if (periods_per_week !== undefined) {
      const ppw = Math.min(12, Math.max(1, parseInt(periods_per_week) || 4))
      updates.push(`periods_per_week = $${values.length + 1}`); values.push(ppw)
    }

    if (updates.length > 0) {
      values.push(subject_id)
      await pool.query(`UPDATE class_subjects SET ${updates.join(', ')} WHERE id = $${values.length}`, values)
    }

    const effectiveName = newName || sub.subject_name

    // If name changed, update timetable slots
    if (newName && newName !== sub.subject_name) {
      await pool.query(
        `UPDATE class_timetable SET subject_name = $1 WHERE class_id = $2 AND subject_name = $3`,
        [newName, id, sub.subject_name]
      )
    }

    // If teacher changed, propagate to timetable (conflict-safe)
    if (teacher_id !== undefined) {
      const tid = teacher_id ? Number(teacher_id) : null
      if (tid) {
        await pool.query(
          `UPDATE class_timetable ct SET teacher_id = $1
           WHERE ct.class_id = $2 AND ct.subject_name = $3 AND ct.is_break = FALSE
             AND ct.teacher_id IS DISTINCT FROM $1
             AND NOT EXISTS (
               SELECT 1 FROM class_timetable o
               WHERE o.school_id = ct.school_id AND o.class_id != ct.class_id
                 AND o.day_of_week = ct.day_of_week AND o.period_number = ct.period_number
                 AND o.teacher_id = $1 AND o.is_break = FALSE
             )`,
          [tid, id, effectiveName]
        )
      }
    }

    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`timetable:class:${id}`)
    invalidateCache(`health:${sub.school_id}`)

    const tid = teacher_id !== undefined ? (teacher_id ? Number(teacher_id) : null) : null
    const teacherName = tid
      ? (await pool.query('SELECT name FROM teachers WHERE id = $1', [tid])).rows[0]?.name ?? null
      : null
    return NextResponse.json({ subject_id, teacher_id: tid, teacher_name: teacherName, subject_name: effectiveName })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update subject' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const subject_id = req.nextUrl.searchParams.get('subject_id')
  if (!subject_id) return NextResponse.json({ error: 'subject_id required' }, { status: 400 })
  try {
    // Get the subject name before deleting
    const { rows: [sub] } = await pool.query(
      'SELECT cs.subject_name, c.school_id FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = $1 AND cs.class_id = $2',
      [subject_id, id]
    )
    await pool.query('DELETE FROM class_subjects WHERE id = $1 AND class_id = $2', [subject_id, id])
    // Clear this subject from the timetable so no orphaned slots remain
    if (sub?.subject_name) {
      await pool.query(
        `UPDATE class_timetable
         SET subject_name = NULL, teacher_id = NULL, is_manual = FALSE
         WHERE class_id = $1 AND subject_name = $2 AND is_break = FALSE`,
        [id, sub.subject_name]
      )
    }
    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`timetable:class:${id}`)
    if (sub?.school_id) {
      invalidateCache(`health:${sub.school_id}`)
      invalidateCache(`timetable:school:${sub.school_id}`)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
  }
}
