import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { matchTeacher } from '@/lib/matchTeacher'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'
import { requireFeeAccess } from '@/lib/auth'
import { ClassWorkflowError, validateTeacherForClass } from '@/lib/classManagement'
import { parseOptionalTeacherId, parsePeriodsPerWeek } from '@/lib/classValidation'
import type { Pool, PoolClient } from 'pg'
import { getSubjectsForGrade } from '@/lib/curricula'

type RouteContext = { params: Promise<{ id: string }> }

function parseId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function canonicalSubject(client: Pool | PoolClient, schoolId: number, grade: string, raw: unknown) {
  const subjectName = typeof raw === 'string' ? raw.trim() : ''
  if (!subjectName) throw new ClassWorkflowError('subject_name is required', 422, 'SUBJECT_REQUIRED')
  if (subjectName.length > 100) throw new ClassWorkflowError('subject_name must be 100 characters or fewer', 422, 'SUBJECT_TOO_LONG')

  const { rows: years } = await client.query<{ label: string }>(
    `SELECT label FROM academic_years WHERE school_id = $1
     ORDER BY is_current DESC, start_date DESC LIMIT 1`,
    [schoolId],
  )
  const subscribed = years[0]
    ? await client.query<{ subject_name: string }>(
        `SELECT subject_name FROM school_subjects
         WHERE school_id = $1 AND grade = $2 AND academic_year = $3`,
        [schoolId, grade, years[0].label],
      )
    : { rows: [] as { subject_name: string }[] }
  let allowed = subscribed.rows.map(row => row.subject_name)
  if (allowed.length === 0) {
    const { rows: curricula } = await client.query<{ curriculum_type: string }>(
      `SELECT curriculum_type FROM curriculum_assignments
       WHERE school_id = $1 AND grade = $2 LIMIT 1`,
      [schoolId, grade],
    )
    allowed = getSubjectsForGrade(curricula[0]?.curriculum_type ?? 'CBSE', grade).map(subject => subject.name)
  }
  if (allowed.length === 0) {
    throw new ClassWorkflowError(
      `No subjects are configured for Grade ${grade}. Subscribe them in Syllabus Customizer first.`,
      422,
      'SUBJECTS_NOT_CONFIGURED',
    )
  }
  const match = allowed.find(allowedName => allowedName.toLowerCase() === subjectName.toLowerCase())
  if (!match) {
    throw new ClassWorkflowError(
      `"${subjectName}" is not configured for Grade ${grade}. Use one of: ${allowed.join(', ')}`,
      422,
      'SUBJECT_NOT_SUBSCRIBED',
    )
  }
  return match
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
  try {
    const { rows: [cls] } = await pool.query('SELECT school_id FROM classes WHERE id = $1 AND deleted_at IS NULL', [id])
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!await requireFeeAccess(cls.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const cacheKey = `subjects:class:${id}`
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
    const result = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.teacher_id, cs.periods_per_week, t.name AS teacher_name
       FROM class_subjects cs
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1 ORDER BY cs.subject_name`,
      [id],
    )
    setCache(cacheKey, result.rows, 60_000)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('[classes/:id/subjects GET]', error)
    return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  const periods = parsePeriodsPerWeek(body.periods_per_week)
  const teacherId = parseOptionalTeacherId(body.teacher_id)
  if (periods.error || teacherId.error) return NextResponse.json({ error: periods.error ?? teacherId.error }, { status: 422 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [cls] } = await client.query<{ school_id: number; grade: string }>(
      'SELECT school_id, grade FROM classes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id],
    )
    if (!cls) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!await requireFeeAccess(cls.school_id, client)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const subjectName = await canonicalSubject(client, cls.school_id, cls.grade, body.subject_name)
    let resolvedTeacherId = teacherId.value ?? null
    if (resolvedTeacherId) {
      await validateTeacherForClass(client, {
        teacherId: resolvedTeacherId, schoolId: cls.school_id, grade: cls.grade, subjectName,
      })
    } else {
      const { rows: staff } = await client.query<{ id: number; subject: string; teaches_grades: string | null }>(
        `SELECT id, subject, teaches_grades FROM teachers
         WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
           AND removed_at IS NULL AND subject IS NOT NULL AND subject != ''`,
        [cls.school_id],
      )
      const eligible = staff.filter(teacher => !teacher.teaches_grades?.trim() || teacher.teaches_grades.split(',').map(g => g.trim().toUpperCase()).includes(cls.grade.toUpperCase()))
      resolvedTeacherId = matchTeacher(subjectName, eligible)
    }
    const result = await client.query(
      `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, subject_name) DO UPDATE
       SET teacher_id = EXCLUDED.teacher_id, periods_per_week = EXCLUDED.periods_per_week
       RETURNING *`,
      [id, subjectName, resolvedTeacherId, periods.value],
    )
    const teacherName = resolvedTeacherId
      ? (await client.query('SELECT name FROM teachers WHERE id = $1', [resolvedTeacherId])).rows[0]?.name ?? null
      : null
    await client.query('COMMIT')
    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`health:${cls.school_id}`)
    return NextResponse.json({ ...result.rows[0], teacher_name: teacherName }, { status: 201 })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof ClassWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[classes/:id/subjects POST]', error)
    return NextResponse.json({ error: 'Failed to add subject' }, { status: 500 })
  } finally { client.release() }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  const subjectId = Number(body.subject_id)
  if (!Number.isInteger(subjectId) || subjectId <= 0) return NextResponse.json({ error: 'Valid subject_id is required' }, { status: 400 })
  const allowed = new Set(['subject_id', 'subject_name', 'teacher_id', 'periods_per_week'])
  const unsupported = Object.keys(body).filter(key => !allowed.has(key))
  if (unsupported.length) return NextResponse.json({ error: `Unsupported fields: ${unsupported.join(', ')}` }, { status: 400 })
  if (!Object.hasOwn(body, 'subject_name') && !Object.hasOwn(body, 'teacher_id') && !Object.hasOwn(body, 'periods_per_week')) {
    return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [sub] } = await client.query<{
      subject_name: string
      teacher_id: number | null
      periods_per_week: number
      school_id: number
      grade: string
    }>(
      `SELECT cs.subject_name, cs.teacher_id, cs.periods_per_week, c.school_id, c.grade
       FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
       WHERE cs.id = $1 AND cs.class_id = $2 AND c.deleted_at IS NULL FOR UPDATE`,
      [subjectId, id],
    )
    if (!sub) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    if (!await requireFeeAccess(sub.school_id, client)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subjectName = Object.hasOwn(body, 'subject_name')
      ? await canonicalSubject(client, sub.school_id, sub.grade, body.subject_name)
      : sub.subject_name
    const teacherId = Object.hasOwn(body, 'teacher_id') ? parseOptionalTeacherId(body.teacher_id) : { value: sub.teacher_id }
    const periods = Object.hasOwn(body, 'periods_per_week') ? parsePeriodsPerWeek(body.periods_per_week) : { value: sub.periods_per_week }
    if (teacherId.error || periods.error) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: teacherId.error ?? periods.error }, { status: 422 })
    }
    if (teacherId.value) {
      await validateTeacherForClass(client, {
        teacherId: teacherId.value, schoolId: sub.school_id, grade: sub.grade, subjectName,
      })
    }
    const { rows: [updated] } = await client.query(
      `UPDATE class_subjects SET subject_name = $1, teacher_id = $2, periods_per_week = $3
       WHERE id = $4 AND class_id = $5 RETURNING *`,
      [subjectName, teacherId.value ?? null, periods.value, subjectId, id],
    )
    const teacherName = teacherId.value
      ? (await client.query('SELECT name FROM teachers WHERE id = $1', [teacherId.value])).rows[0]?.name ?? null
      : null
    await client.query('COMMIT')
    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`health:${sub.school_id}`)
    return NextResponse.json({ ...updated, teacher_name: teacherName })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof ClassWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'That subject is already assigned to this class' }, { status: 409 })
    console.error('[classes/:id/subjects PATCH]', error)
    return NextResponse.json({ error: 'Failed to update subject' }, { status: 500 })
  } finally { client.release() }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
  const subjectId = Number(req.nextUrl.searchParams.get('subject_id'))
  if (!Number.isInteger(subjectId) || subjectId <= 0) return NextResponse.json({ error: 'Valid subject_id is required' }, { status: 400 })
  try {
    const { rows: [sub] } = await pool.query<{ school_id: number }>(
      `SELECT c.school_id FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
       WHERE cs.id = $1 AND cs.class_id = $2 AND c.deleted_at IS NULL`,
      [subjectId, id],
    )
    if (!sub) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    if (!await requireFeeAccess(sub.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await pool.query('DELETE FROM class_subjects WHERE id = $1 AND class_id = $2', [subjectId, id])
    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`health:${sub.school_id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[classes/:id/subjects DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
  }
}
