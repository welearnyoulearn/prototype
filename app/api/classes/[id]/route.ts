import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { getTeacherSession, requireFeeAccess } from '@/lib/auth'
import { ClassWorkflowError, validateTeacherForClass } from '@/lib/classManagement'
import { parseOptionalTeacherId } from '@/lib/classValidation'

type RouteContext = { params: Promise<{ id: string }> }

function parseClassId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const id = parseClassId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
  try {
    const classRes = await pool.query(
      `SELECT c.*, t.name AS class_teacher_name
       FROM classes c LEFT JOIN teachers t ON c.class_teacher_id = t.id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    )
    const cls = classRes.rows[0]
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    const adminAccess = await requireFeeAccess(cls.school_id)
    if (!adminAccess) {
      const teacher = await getTeacherSession()
      if (!teacher || teacher.schoolId !== cls.school_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const assignment = await pool.query(
        `SELECT 1 FROM classes c
         WHERE c.id = $1 AND c.deleted_at IS NULL AND (
           c.class_teacher_id = $2 OR EXISTS (
             SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $2
           )
         )`,
        [id, teacher.teacherId],
      )
      if (assignment.rowCount === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subjectsRes = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.teacher_id, cs.periods_per_week,
              t.name AS teacher_name
       FROM class_subjects cs
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1
       ORDER BY cs.subject_name`,
      [id],
    )
    return NextResponse.json({ ...cls, subjects: subjectsRes.rows })
  } catch (error) {
    console.error('[classes/:id GET]', error)
    return NextResponse.json({ error: 'Failed to fetch class' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const id = parseClassId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  const unsupported = Object.keys(body).filter(key => key !== 'class_teacher_id')
  if (unsupported.length) return NextResponse.json({ error: `Unsupported fields: ${unsupported.join(', ')}` }, { status: 400 })
  if (!Object.hasOwn(body, 'class_teacher_id')) return NextResponse.json({ error: 'class_teacher_id is required' }, { status: 400 })
  const teacherId = parseOptionalTeacherId(body.class_teacher_id)
  if (teacherId.error) return NextResponse.json({ error: teacherId.error }, { status: 422 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [existing] } = await client.query<{
      school_id: number
      grade: string
      deleted_at: string | null
    }>('SELECT school_id, grade, deleted_at FROM classes WHERE id = $1 FOR UPDATE', [id])
    if (!existing || existing.deleted_at) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!await requireFeeAccess(existing.school_id, client)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (teacherId.value) {
      await validateTeacherForClass(client, {
        teacherId: teacherId.value, schoolId: existing.school_id, grade: existing.grade,
      })
    }
    const result = await client.query(
      'UPDATE classes SET class_teacher_id = $1 WHERE id = $2 RETURNING *',
      [teacherId.value ?? null, id],
    )
    await client.query('COMMIT')
    invalidateCache(`classes:${existing.school_id}`)
    invalidateCache(`health:${existing.school_id}`)
    return NextResponse.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof ClassWorkflowError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[classes/:id PUT]', error)
    return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
  } finally {
    client.release()
  }
}

const DELETE_MODES = new Set(['deactivate', 'reassign', 'manual'])

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const id = parseClassId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch {}
  const mode = body.mode === undefined ? 'deactivate' : String(body.mode)
  if (!DELETE_MODES.has(mode)) {
    return NextResponse.json({ error: 'mode must be deactivate, reassign, or manual' }, { status: 400 })
  }
  const targetClassId = body.targetClassId === undefined ? null : Number(body.targetClassId)
  if (mode === 'reassign' && (!Number.isInteger(targetClassId) || Number(targetClassId) <= 0)) {
    return NextResponse.json({ error: 'A valid targetClassId is required for reassign' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [cls] } = await client.query<{
      school_id: number
      grade: string
      section: string
      deleted_at: string | null
    }>('SELECT school_id, grade, section, deleted_at FROM classes WHERE id = $1 FOR UPDATE', [id])
    if (!cls || cls.deleted_at) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!await requireFeeAccess(cls.school_id, client)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [{ count }] } = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM students
       WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
      [cls.school_id, cls.grade, cls.section],
    )

    if (mode === 'manual' && count > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Students still active in this class', activeStudentCount: count }, { status: 409 })
    }

    if (mode === 'reassign') {
      const { rows: [target] } = await client.query<{
        school_id: number
        grade: string
        section: string
      }>(
        'SELECT school_id, grade, section FROM classes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [targetClassId],
      )
      if (!target) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Target class not found' }, { status: 404 })
      }
      if (target.school_id !== cls.school_id || target.grade !== cls.grade || target.section === cls.section) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Target class must be a different active section in the same school and grade' }, { status: 400 })
      }
      const { rows: collisions } = await client.query<{ name: string; school_roll_number: number }>(
        `SELECT s.name, s.school_roll_number FROM students s
         WHERE s.school_id = $1 AND s.grade = $2 AND s.section = $3 AND s.status = 'active'
           AND s.school_roll_number IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM students t
             WHERE t.school_id = $1 AND t.grade = $4 AND t.section = $5
               AND t.school_roll_number = s.school_roll_number
           )`,
        [cls.school_id, cls.grade, cls.section, target.grade, target.section],
      )
      if (collisions.length) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `Roll number already taken in the target section for: ${collisions.map(row => `${row.name} (#${row.school_roll_number})`).join(', ')}`,
        }, { status: 409 })
      }
      await client.query(
        `UPDATE students SET grade = $4, section = $5
         WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [cls.school_id, cls.grade, cls.section, target.grade, target.section],
      )
    } else if (mode === 'deactivate') {
      await client.query(
        `UPDATE students SET status = 'inactive'
         WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [cls.school_id, cls.grade, cls.section],
      )
    }

    await client.query('UPDATE class_subjects SET teacher_id = NULL WHERE class_id = $1', [id])
    await client.query('UPDATE classes SET class_teacher_id = NULL, deleted_at = NOW() WHERE id = $1', [id])
    await client.query('COMMIT')

    invalidateCache(`classes:${cls.school_id}`)
    invalidateCache(`health:${cls.school_id}`)
    invalidateCache(`subjects:class:${id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[classes/:id DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
  } finally {
    client.release()
  }
}
