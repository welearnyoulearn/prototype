import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// POST /api/academic-years/rollover
// The ONLY correct way to advance students to the next academic year.
//
// What this does (all in one transaction):
//   1. Validates: current year exists, new year exists, rollover not already done
//   2. SNAPSHOTS: inserts one student_class_history row per active student
//      recording their grade+section for the CURRENT year — permanent audit trail
//   3. PROMOTES: increments each student's grade by 1
//      (numeric: 6→7, 7→8 … | alpha: Nursery→LKG→UKG→1)
//   4. GRADUATES: marks final-grade students as status='graduated'
//   5. SETS new year as current academic year
//
// Body: {
//   school_id,
//   from_year_id,      -- current academic year id (will be snapshotted)
//   to_year_id,        -- next academic year id (will become current)
//   final_grade,       -- grade whose students graduate (e.g. "12")
//   grade_sequence,    -- ordered array of all grades e.g. ["Nursery","LKG","UKG","1","2"..."12"]
// }
//
// Returns: { snapshotted, promoted, graduated, errors }

function nextGradeInSequence(current: string, sequence: string[]): string | null {
  const idx = sequence.indexOf(current)
  if (idx === -1 || idx === sequence.length - 1) return null
  return sequence[idx + 1]
}

export async function POST(req: NextRequest) {

  const body = await req.json()
  const { school_id, from_year_id, to_year_id, final_grade, grade_sequence } = body

  if (!school_id || !from_year_id || !to_year_id) {
    return NextResponse.json(
      { error: 'school_id, from_year_id, to_year_id required' },
      { status: 400 }
    )
  }
  if (!Array.isArray(grade_sequence) || grade_sequence.length < 2) {
    return NextResponse.json(
      { error: 'grade_sequence must be an ordered array of at least 2 grades' },
      { status: 400 }
    )
  }

  const sid = parseInt(school_id)

  // Verify both years belong to this school
  const { rows: years } = await pool.query(
    `SELECT id, label, is_current FROM academic_years WHERE id = ANY($1) AND school_id = $2`,
    [[from_year_id, to_year_id], sid]
  )
  if (years.length < 2) {
    return NextResponse.json({ error: 'One or both academic year IDs not found for this school' }, { status: 404 })
  }

  // Check rollover not already done for to_year
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM student_class_history WHERE academic_year_id = $1 AND school_id = $2`,
    [to_year_id, sid]
  )
  // We snapshot into from_year_id, so check from_year for existing snapshot
  const { rows: fromExisting } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM student_class_history WHERE academic_year_id = $1 AND school_id = $2`,
    [from_year_id, sid]
  )
  if (fromExisting[0].cnt > 0) {
    return NextResponse.json(
      { error: 'Rollover already performed for this year. History snapshot already exists.' },
      { status: 409 }
    )
  }

  void existing // suppress lint

  // Fetch all active students
  const { rows: students } = await pool.query(
    `SELECT id, grade, section FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`,
    [sid]
  )

  const client = await pool.connect()
  let snapshotted = 0
  let promoted    = 0
  let graduated   = 0
  const errors: string[] = []
  const now = new Date().toISOString()

  try {
    await client.query('BEGIN')

    for (const student of students) {
      const isGraduating = final_grade && student.grade === final_grade
      const nextGrade = isGraduating
        ? null
        : nextGradeInSequence(student.grade, grade_sequence)

      // 1. Snapshot — record where this student IS RIGHT NOW (from_year)
      try {
        await client.query(`
          INSERT INTO student_class_history
            (student_id, school_id, academic_year_id, grade, section, promoted_to_grade, promoted_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (student_id, academic_year_id) DO NOTHING
        `, [
          student.id, sid, from_year_id,
          student.grade, student.section,
          isGraduating ? null : nextGrade,
          now,
        ])
        snapshotted++
      } catch (e) {
        errors.push(`Snapshot failed for student ${student.id}: ${e}`)
        continue
      }

      // 2. Promote or graduate
      if (isGraduating) {
        await client.query(
          `UPDATE students SET status = 'graduated' WHERE id = $1`,
          [student.id]
        )
        graduated++
      } else if (nextGrade) {
        await client.query(
          `UPDATE students SET grade = $1 WHERE id = $2`,
          [nextGrade, student.id]
        )
        promoted++
      } else {
        // grade not in sequence — leave as-is, just snapshot
        errors.push(`Grade "${student.grade}" not in grade_sequence — student ${student.id} not promoted`)
      }
    }

    // 3. Set to_year as current
    await client.query(
      `UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`,
      [sid]
    )
    await client.query(
      `UPDATE academic_years SET is_current = TRUE WHERE id = $1`,
      [to_year_id]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      snapshotted,
      promoted,
      graduated,
      errors,
      message: `Rollover complete: ${promoted} promoted, ${graduated} graduated, ${snapshotted} records archived.`,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[academic-years/rollover]', err)
    return NextResponse.json({ error: 'Rollover failed — transaction rolled back, no data changed' }, { status: 500 })
  } finally {
    client.release()
  }
}

// GET /api/academic-years/rollover?school_id=&student_id=
// Returns the full class history for a specific student — every year they were in school.
export async function GET(req: NextRequest) {

  const school_id  = req.nextUrl.searchParams.get('school_id')
  const student_id = req.nextUrl.searchParams.get('student_id')

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }

  const { rows } = await pool.query(`
    SELECT
      sch.id,
      sch.grade,
      sch.section,
      sch.promoted_to_grade,
      sch.promoted_at,
      ay.label   AS academic_year,
      ay.start_date::text,
      ay.end_date::text,
      ay.is_current
    FROM student_class_history sch
    JOIN academic_years ay ON ay.id = sch.academic_year_id
    WHERE sch.student_id = $1 AND sch.school_id = $2
    ORDER BY ay.start_date DESC
  `, [student_id, school_id])

  return NextResponse.json(rows)
}
