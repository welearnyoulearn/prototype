import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSubjectsForGrade } from '@/lib/curricula'
import { matchTeacher } from '@/lib/matchTeacher'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'

export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  const removed = req.nextUrl.searchParams.get('removed') === 'true'

  if (!removed) {
    const cached = getCache(`classes:${school_id}`)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const studentStatus = removed ? 'inactive' : 'active'
    const deletedFilter = removed ? 'IS NOT NULL' : 'IS NULL'
    const orderBy = removed
      ? `c.deleted_at DESC, (NULLIF(regexp_replace(c.grade,'[^0-9]','','g'),''))::int NULLS LAST, c.section`
      : `(NULLIF(regexp_replace(c.grade,'[^0-9]','','g'),''))::int NULLS LAST, c.section`

    const result = await pool.query(
      `SELECT c.*, t.name AS class_teacher_name,
              (SELECT COUNT(*) FROM students s WHERE s.grade = c.grade AND s.section = c.section AND s.school_id = c.school_id AND s.status = $2) AS student_count
       FROM classes c
       LEFT JOIN teachers t ON c.class_teacher_id = t.id
       WHERE c.school_id = $1 AND c.deleted_at ${deletedFilter}
       ORDER BY ${orderBy}`,
      [school_id, studentStatus]
    )
    if (!removed) setCache(`classes:${school_id}`, result.rows, 60_000)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, grade, section, class_teacher_id } = await req.json()
    if (!school_id || !grade || !section) {
      return NextResponse.json({ error: 'school_id, grade, section required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Create the class
      const { rows: [newClass] } = await client.query(
        `INSERT INTO classes (school_id, grade, section, class_teacher_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [school_id, grade.trim(), section.trim(), class_teacher_id || null]
      )

      // 2. Auto-assign subjects from curriculum
      //    Check if a curriculum is assigned for this grade, else default to CBSE
      const { rows: currRows } = await client.query(
        'SELECT curriculum_type FROM curriculum_assignments WHERE school_id=$1 AND grade=$2',
        [school_id, grade.trim()]
      )
      const curriculumType: string = currRows[0]?.curriculum_type ?? 'CBSE'
      const subjects = getSubjectsForGrade(curriculumType, grade.trim())

      let subjectsAssigned = 0
      if (subjects.length > 0) {
        // 3. Fetch active teaching staff for teacher auto-matching
        const { rows: staff } = await client.query(
          `SELECT id, subject, teaches_grades FROM teachers
           WHERE school_id=$1 AND staff_type='teaching' AND status='active'
             AND subject IS NOT NULL AND subject != ''`,
          [school_id]
        )
        // Filter to teachers allowed for this grade
        const eligible = staff.filter((t: { teaches_grades: string | null }) => {
          if (!t.teaches_grades) return true
          const allowed = t.teaches_grades.split(',').map((g: string) => g.trim().toUpperCase())
          return allowed.includes(grade.trim().toUpperCase())
        })
        const pool4Match = eligible.length > 0 ? eligible : staff

        for (const subj of subjects) {
          const teacherId = matchTeacher(subj.name, pool4Match)
          await client.query(
            `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
             VALUES ($1, $2, $3, 4)
             ON CONFLICT (class_id, subject_name) DO NOTHING`,
            [newClass.id, subj.name, teacherId]
          )
          subjectsAssigned++
        }
      }

      await client.query('COMMIT')
      invalidateCache(`classes:${school_id}`)
      return NextResponse.json({ ...newClass, subjects_assigned: subjectsAssigned }, { status: 201 })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'This class already exists' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
  }
}
