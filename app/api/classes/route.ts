import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'
import { gradeOrderSql } from '@/lib/grades'
import {
  getPlatformSession, getSession, getTeacherSession, getStudentSession, getParentSession,
  requireFeeAccess, schoolHasAnyFeature,
} from '@/lib/auth'
import { CLASS_READ_FEATURES } from '@/lib/featureRoutes'
import { ClassWorkflowError, ensureClassWithSetup, validateTeacherForClass } from '@/lib/classManagement'
import { normalizeClassIdentity, parseOptionalTeacherId } from '@/lib/classValidation'

export async function GET(req: NextRequest) {
  try {
    const platform = await getPlatformSession()
    const admin = platform ? null : await getSession()
    const teacher = platform || admin ? null : await getTeacherSession()
    const student = platform || admin || teacher ? null : await getStudentSession()
    const parent = platform || admin || teacher || student ? null : await getParentSession()
    if (!platform && !admin && !teacher && !student && !parent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    const requestedSchoolId = Number(school_id)
    const actorSchoolId = Number(admin?.schoolId ?? teacher?.schoolId ?? student?.schoolId ?? parent?.schoolId)
    if (!platform && actorSchoolId !== requestedSchoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const removed = req.nextUrl.searchParams.get('removed') === 'true'
    if (removed && !platform && !admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (admin && !(await schoolHasAnyFeature(requestedSchoolId, CLASS_READ_FEATURES))) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 })
    }

    const unrestricted = !!platform || !!admin
    if (!removed && unrestricted) {
      const cached = getCache(`classes:${school_id}`)
      if (cached) return NextResponse.json(cached)
    }

    try {
      const studentStatus = removed ? 'inactive' : 'active'
      const deletedFilter = removed ? 'IS NOT NULL' : 'IS NULL'
      const orderBy = removed
        ? `c.deleted_at DESC, ${gradeOrderSql('c.grade')}, c.section`
        : `${gradeOrderSql('c.grade')}, c.section`

      const values: (string | number)[] = [requestedSchoolId, studentStatus]
      const scope: string[] = []
      if (teacher) {
        values.push(teacher.teacherId)
        scope.push(`AND (c.class_teacher_id = $${values.length} OR EXISTS (
          SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $${values.length}
        ))`)
      } else if (student) {
        values.push(student.studentId)
        scope.push(`AND EXISTS (
          SELECT 1 FROM students s WHERE s.id = $${values.length} AND s.school_id = c.school_id
            AND s.grade = c.grade AND s.section = c.section AND COALESCE(s.status, 'active') = 'active'
        )`)
      } else if (parent) {
        values.push(parent.parentId)
        scope.push(`AND EXISTS (
          SELECT 1 FROM student_parents sp JOIN students s ON s.id = sp.student_id
          WHERE sp.parent_id = $${values.length} AND s.school_id = c.school_id
            AND s.grade = c.grade AND s.section = c.section AND COALESCE(s.status, 'active') = 'active'
        )`)
      }

      const result = await pool.query(
        `SELECT c.*, t.name AS class_teacher_name,
                (SELECT COUNT(*) FROM students s WHERE s.grade = c.grade AND s.section = c.section AND s.school_id = c.school_id AND s.status = $2) AS student_count
         FROM classes c
         LEFT JOIN teachers t ON c.class_teacher_id = t.id
         WHERE c.school_id = $1 AND c.deleted_at ${deletedFilter}
         ${scope.join('\n')}
         ORDER BY ${orderBy}`,
        values
      )
      if (!removed && unrestricted) setCache(`classes:${school_id}`, result.rows, 60_000)
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
    const schoolId = Number(body.school_id)
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      return NextResponse.json({ error: 'Valid school_id is required' }, { status: 400 })
    }
    const identity = normalizeClassIdentity(body.grade, body.section)
    if (!identity.data) return NextResponse.json({ error: identity.errors.join(' · '), errors: identity.errors }, { status: 422 })
    const teacherId = parseOptionalTeacherId(body.class_teacher_id)
    if (teacherId.error) return NextResponse.json({ error: teacherId.error }, { status: 422 })
    if (!await requireFeeAccess(schoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (teacherId.value) {
        await validateTeacherForClass(client, {
          teacherId: teacherId.value, schoolId, grade: identity.data.grade,
        })
      }
      const setup = await ensureClassWithSetup(client, {
        schoolId,
        grade: identity.data.grade,
        section: identity.data.section,
        classTeacherId: teacherId.value,
        restoreDeleted: true,
        failIfActiveExists: true,
      })
      await client.query('COMMIT')
      invalidateCache(`classes:${schoolId}`)
      invalidateCache(`subjects:class:${setup.classRow.id}`)
      invalidateCache(`health:${schoolId}`)
      return NextResponse.json({
        ...setup.classRow,
        restored: setup.restored,
        subjects_assigned: setup.subjectsAssigned,
        unmatched_subjects: setup.unmatchedSubjects,
      }, { status: setup.restored ? 200 : 201 })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

  } catch (error: unknown) {
    if (error instanceof ClassWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'This class already exists' }, { status: 409 })
    console.error(error)
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
  }
}
