import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSubjectsForGrade, CURRICULA } from '@/lib/curricula'

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
        // Build subject->teacher lookup from school's teaching staff
        const teachersRes = await client.query(
          `SELECT id, subject FROM teachers
           WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
             AND subject IS NOT NULL AND subject != ''`,
          [school_id]
        )
        const teacherBySubject: Record<string, number> = {}
        for (const t of teachersRes.rows) {
          const key = t.subject.trim().toLowerCase()
          if (!teacherBySubject[key]) teacherBySubject[key] = t.id // first match wins
        }

        for (const cls of classesRes.rows) {
          // Clear existing subjects for this class
          await client.query('DELETE FROM class_subjects WHERE class_id = $1', [cls.id])
          // Add new subjects from curriculum, auto-assign teacher if found
          for (const subj of subjects) {
            const teacherId = teacherBySubject[subj.name.trim().toLowerCase()] || null
            await client.query(
              'INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1,$2,$3)',
              [cls.id, subj.name, teacherId]
            )
            subjectsAdded++
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
      // Delete teacher timetable entries that came from these classes
      await client.query(
        `DELETE FROM timetable
         WHERE school_id = $1
           AND (teacher_id, day_of_week, period_number) IN (
             SELECT teacher_id, day_of_week, period_number
             FROM class_timetable
             WHERE class_id = ANY($2) AND teacher_id IS NOT NULL AND is_break = FALSE
           )`,
        [school_id, classIds]
      )
      // Delete class timetable entries
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
