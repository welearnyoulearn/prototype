import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

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
//   final_grade,       -- grade whose students graduate (e.g. "10")
//   grade_sequence,    -- ordered array of all grades e.g. ["Nursery","LKG","UKG","1","2"..."10"]
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
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // Fast-path check (non-authoritative — see the locked re-check inside the
  // transaction below, which is what actually prevents a race).
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

  const client = await pool.connect()
  let snapshotted = 0
  let promoted    = 0
  let graduated   = 0
  const errors: string[] = []
  const now = new Date().toISOString()

  try {
    await client.query('BEGIN')

    // Lock the from_year's academic_years row for the duration of this transaction —
    // two concurrent rollover requests for the same year will serialize here, so the
    // second one's re-check below always sees the first one's snapshot rows (if it
    // already committed) or blocks until it does. Without this, both requests could
    // pass the unlocked check above before either writes anything, and BOTH would
    // promote every student — e.g. grade 1 -> 2 -> 3 instead of 1 -> 2.
    await client.query(`SELECT id FROM academic_years WHERE id = $1 FOR UPDATE`, [from_year_id])

    const { rows: raceCheck } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM student_class_history WHERE academic_year_id = $1 AND school_id = $2`,
      [from_year_id, sid]
    )
    if (raceCheck[0].cnt > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Rollover already performed for this year. History snapshot already exists.' },
        { status: 409 }
      )
    }

    // Fetch all active students — inside the transaction, after the lock, so this
    // reflects the true pre-rollover roster even if another request is mid-flight.
    const { rows: students } = await client.query(
      `SELECT id, grade, section FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`,
      [sid]
    )

    for (const student of students) {
      // students.grade is nullable but student_class_history.grade is NOT NULL —
      // a student with no grade recorded can't be meaningfully snapshotted or
      // promoted, so skip them rather than attempting an INSERT that would throw
      // and abort the whole transaction (see note below on why that matters).
      if (!student.grade) {
        errors.push(`Student ${student.id} has no grade set — skipped`)
        continue
      }

      // A student whose grade is the configured final_grade, OR whose grade isn't in
      // the current sequence at all but is purely numeric and higher than every grade
      // in it (e.g. a grade 11/12 student left over from a school that shortened its
      // ladder to end at grade 10), is treated as graduating rather than silently
      // stuck un-promoted.
      const maxSeqNum = Math.max(0, ...grade_sequence.filter((g: string) => /^\d+$/.test(g)).map(Number))
      const isBeyondSequence = /^\d+$/.test(student.grade) && Number(student.grade) > maxSeqNum
      const isGraduating = (!!final_grade && student.grade === final_grade) || isBeyondSequence
      const nextGrade = isGraduating
        ? null
        : nextGradeInSequence(student.grade, grade_sequence)

      // 1. Snapshot — record where this student IS RIGHT NOW (from_year).
      // students.section is nullable but student_class_history.section is NOT NULL —
      // coalesce so a student with no section recorded doesn't throw a constraint
      // violation. A caught error here would otherwise abort the whole Postgres
      // transaction (every later statement in this same BEGIN/COMMIT, including the
      // promote/graduate UPDATEs for every other student, would then fail too), even
      // though the JS try/catch below makes it look like only this one student failed.
      try {
        await client.query(`
          INSERT INTO student_class_history
            (student_id, school_id, academic_year_id, grade, section, promoted_to_grade, promoted_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (student_id, academic_year_id) DO NOTHING
        `, [
          student.id, sid, from_year_id,
          student.grade, student.section || '',
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
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
