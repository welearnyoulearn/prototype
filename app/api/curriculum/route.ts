import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSubjectsForGrade, CURRICULA } from '@/lib/curricula'
import { matchTeacher } from '@/lib/matchTeacher'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const result = await pool.query(
      'SELECT * FROM curriculum_assignments WHERE school_id = $1 ORDER BY grade',
      [school_id]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch curriculum assignments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, grade, curriculum_type, auto_assign_subjects } = await req.json()
    if (!school_id || !grade || !curriculum_type) {
      return NextResponse.json({ error: 'school_id, grade, curriculum_type required' }, { status: 400 })
    }
    if (!CURRICULA[curriculum_type]) {
      return NextResponse.json({ error: 'Unknown curriculum type' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Upsert curriculum assignment
      const result = await client.query(
        `INSERT INTO curriculum_assignments (school_id, grade, curriculum_type)
         VALUES ($1,$2,$3)
         ON CONFLICT (school_id, grade) DO UPDATE SET curriculum_type = EXCLUDED.curriculum_type
         RETURNING *`,
        [school_id, grade, curriculum_type]
      )

      let subjectsAdded = 0
      if (auto_assign_subjects) {
        const subjects = getSubjectsForGrade(curriculum_type, grade)
        // Get all classes for this grade in the school
        const classesRes = await client.query(
          'SELECT id FROM classes WHERE school_id = $1 AND grade = $2',
          [school_id, grade]
        )
        // Fetch all active teaching staff for smart matching
        const teachersRes = await client.query(
          `SELECT id, subject, teaches_grades FROM teachers
           WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
             AND subject IS NOT NULL AND subject != ''`,
          [school_id]
        )
        const allTeachers: { id: number; subject: string; teaches_grades: string | null }[] = teachersRes.rows

        for (const cls of classesRes.rows) {
          // Fetch class grade to filter by teaches_grades
          const { rows: [clsRow] } = await client.query(
            'SELECT grade, section FROM classes WHERE id=$1', [cls.id]
          )

          await client.query('DELETE FROM class_subjects WHERE class_id = $1', [cls.id])

          for (const subj of subjects) {
            // Filter teachers who can teach this grade
            const eligible = allTeachers.filter(t => {
              if (!t.teaches_grades) return true
              const allowed = t.teaches_grades.split(',').map((g: string) => g.trim().toUpperCase())
              const g = (clsRow?.grade ?? '').toUpperCase()
              const cls2 = `${g}${(clsRow?.section ?? '').toUpperCase()}`
              return allowed.includes(g) || allowed.includes(cls2)
            })

            const teacherId = matchTeacher(subj.name, eligible.length > 0 ? eligible : allTeachers)
            await client.query(
              'INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1,$2,$3)',
              [cls.id, subj.name, teacherId]
            )
            subjectsAdded++

            // If a timetable already exists for this class, push the teacher assignment
            // into existing class_timetable rows for this subject (no regeneration needed).
            // Only update slots where this teacher is NOT already busy in another class.
            if (teacherId) {
              await client.query(
                `UPDATE class_timetable ct
                 SET teacher_id = $1
                 WHERE ct.class_id = $2
                   AND ct.subject_name = $3
                   AND ct.is_break = FALSE
                   AND NOT EXISTS (
                     SELECT 1 FROM class_timetable other
                     WHERE other.school_id  = ct.school_id
                       AND other.class_id   != ct.class_id
                       AND other.day_of_week   = ct.day_of_week
                       AND other.period_number = ct.period_number
                       AND other.teacher_id    = $1
                       AND other.is_break = FALSE
                   )`,
                [teacherId, cls.id, subj.name]
              )

            }
          }
        }
      }

      await client.query('COMMIT')
      return NextResponse.json({ ...result.rows[0], subjects_added: subjectsAdded }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to assign curriculum' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const grade = searchParams.get('grade')
  if (!school_id || !grade) return NextResponse.json({ error: 'school_id and grade required' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get all classes for this grade
    const classesRes = await client.query(
      'SELECT id FROM classes WHERE school_id = $1 AND grade = $2',
      [school_id, grade]
    )
    const classIds = classesRes.rows.map((r: { id: number }) => r.id)

    if (classIds.length > 0) {
      // Delete class timetable entries (teacher view is derived live — no separate table)
      await client.query(
        'DELETE FROM class_timetable WHERE class_id = ANY($1)',
        [classIds]
      )
    }

    // Remove the curriculum assignment
    await client.query(
      'DELETE FROM curriculum_assignments WHERE school_id = $1 AND grade = $2',
      [school_id, grade]
    )

    await client.query('COMMIT')
    return NextResponse.json({ success: true, classes_cleared: classIds.length })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(error)
    return NextResponse.json({ error: 'Failed to remove curriculum' }, { status: 500 })
  } finally {
    client.release()
  }
}
