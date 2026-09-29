import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { lockYearClose, nextAcademicYearLabel } from '@/lib/feeRollover'
import { FEES_NOT_CLOSED, FEES_NOT_CLOSED_MESSAGE, feeGateRequired, getRolloverReadiness, isFeeYearClosed } from '@/lib/yearRollover'

// POST /api/academic-years/rollover
// The ONLY correct way to advance students to the next academic year.
//
// What this does (all in one transaction):
//   1. Validates: from year is the current year, to year is the NEXT year, rollover not already
//      done, and (when the school uses Fee Management) the fee year-end for the from year is CLOSED
//   2. SNAPSHOTS: inserts one student_class_history row per active student
//      recording their grade+section for the CURRENT year — permanent audit trail
//   3. PROMOTES: increments each student's grade by 1
//      (numeric: 6→7, 7→8 … | alpha: Nursery→LKG→UKG→1)
//      Roll numbers are unique per class, so promotion first frees each promoted student's roll
//      number (kept in the history snapshot) and then gives it back if it is still free in the new
//      class; otherwise it is cleared and the school reassigns it (reported as roll_numbers_cleared).
//      Exceptions (optional body.exceptions): a student can REPEAT the year (same grade + section) or be
//      MOVED into another existing section of the next grade. Each student's outcome is recorded in
//      student_class_history (promoted / repeated / moved / graduated).
//   4. GRADUATES: marks final-grade students as status='graduated'
//   5. SETS new year as current academic year — the whole school follows it
//
// This is the only place a school's active academic year changes after first setup.
// Fee dues are decided and carried in Fee Management → Year-End, which must be closed first
// (409 with code FEES_NOT_CLOSED otherwise).
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

// Per-student exceptions to the default "everyone moves up one grade, same section":
//   repeat — stays in the same grade and section for the new year
//   move   — is promoted as usual but into another (existing) section
const ExceptionsSchema = z.array(z.discriminatedUnion('action', [
  z.object({ student_id: z.number().int().positive(), action: z.literal('repeat') }),
  z.object({ student_id: z.number().int().positive(), action: z.literal('move'), to_section: z.string().trim().min(1).max(10) }),
])).max(5000)

function nextGradeInSequence(current: string, sequence: string[]): string | null {
  const idx = sequence.indexOf(current)
  if (idx === -1 || idx === sequence.length - 1) return null
  return sequence[idx + 1]
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { school_id, from_year_id, to_year_id, final_grade, grade_sequence } = body
  const parsedExceptions = ExceptionsSchema.safeParse(body.exceptions ?? [])
  if (!parsedExceptions.success) {
    return NextResponse.json({ error: 'exceptions must be a list of { student_id, action: "repeat" } or { student_id, action: "move", to_section }' }, { status: 400 })
  }
  const exceptionById = new Map(parsedExceptions.data.map(e => [e.student_id, e]))

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

  if (Number(from_year_id) === Number(to_year_id)) {
    return NextResponse.json({ error: 'The next year must be different from the current year' }, { status: 400 })
  }

  // Verify both years belong to this school
  const { rows: years } = await pool.query(
    `SELECT id, label, is_current FROM academic_years WHERE id = ANY($1) AND school_id = $2`,
    [[from_year_id, to_year_id], sid]
  )
  if (years.length < 2) {
    return NextResponse.json({ error: 'One or both academic year IDs not found for this school' }, { status: 404 })
  }
  const fromYear = years.find(y => Number(y.id) === Number(from_year_id))
  const toYear   = years.find(y => Number(y.id) === Number(to_year_id))
  if (!fromYear || !toYear) {
    return NextResponse.json({ error: 'One or both academic year IDs not found for this school' }, { status: 404 })
  }
  if (!fromYear.is_current) {
    return NextResponse.json({ error: `${fromYear.label} is not the current academic year — only the current year can be rolled over` }, { status: 409 })
  }
  // Fee year-end carries dues into the label that follows the closing year, so students must move to that same year.
  if (/^\d{4}-\d{2}$/.test(fromYear.label) && toYear.label !== nextAcademicYearLabel(fromYear.label)) {
    return NextResponse.json({ error: `The next year must be ${nextAcademicYearLabel(fromYear.label)} (the year after ${fromYear.label})` }, { status: 400 })
  }

  const feeGate = await feeGateRequired(sid)
  if (feeGate && !(await isFeeYearClosed(sid, fromYear.label)).closed) {
    return NextResponse.json({ error: FEES_NOT_CLOSED_MESSAGE, code: FEES_NOT_CLOSED }, { status: 409 })
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
  let rollsCleared = 0
  let repeated = 0
  let moved = 0
  const rollBack: Array<{ id: number; grade: string; section: string | null; roll: number }> = []
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
    // Same advisory lock the fee year-end uses, so a fee reopen/apply cannot slip in mid-rollover.
    await lockYearClose(client, sid, fromYear.label)
    if (feeGate) {
      const { rows: [closed] } = await client.query(
        `SELECT 1 AS x FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [sid, fromYear.label]
      )
      if (!closed) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: FEES_NOT_CLOSED_MESSAGE, code: FEES_NOT_CLOSED }, { status: 409 })
      }
    }

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
      `SELECT id, grade, section, school_roll_number FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')
       ORDER BY school_roll_number NULLS LAST, id`,
      [sid]
    )

    // Validate the exceptions against the real roster BEFORE changing anything.
    const roster = new Map(students.map(st => [Number(st.id), st]))
    const maxSeq = Math.max(0, ...grade_sequence.filter((g: string) => /^\d+$/.test(g)).map(Number))
    const graduatesNow = (grade: string) => (!!final_grade && grade === final_grade) || (/^\d+$/.test(grade) && Number(grade) > maxSeq)
    const badRequest = async (message: string) => {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: message }, { status: 400 })
    }
    for (const ex of exceptionById.values()) {
      const st = roster.get(ex.student_id)
      if (!st) return badRequest(`Student ${ex.student_id} is not an active student of this school`)
      if (!st.grade) return badRequest(`Student ${ex.student_id} has no grade set`)
      if (ex.action === 'move') {
        if (graduatesNow(st.grade)) return badRequest(`Student ${ex.student_id} is graduating — a section change does not apply`)
        const target = nextGradeInSequence(st.grade, grade_sequence)
        if (!target) return badRequest(`Grade "${st.grade}" is not in the grade sequence — cannot move student ${ex.student_id}`)
        const { rows: [cls] } = await client.query(
          `SELECT 1 AS x FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3`, [sid, target, ex.to_section]
        )
        if (!cls) return badRequest(`Section ${ex.to_section} does not exist for grade ${target}. Create the class first.`)
      }
    }

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
      const exception = exceptionById.get(Number(student.id))
      const repeating = exception?.action === 'repeat'
      const isGraduating = !repeating && ((!!final_grade && student.grade === final_grade) || isBeyondSequence)
      const moveTo = exception?.action === 'move' ? exception.to_section : null
      const nextGrade = repeating
        ? student.grade
        : isGraduating
          ? null
          : nextGradeInSequence(student.grade, grade_sequence)
      const outcome = repeating ? 'repeated' : isGraduating ? 'graduated' : moveTo ? 'moved' : 'promoted'

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
            (student_id, school_id, academic_year_id, grade, section, promoted_to_grade, promoted_at, school_roll_number, outcome, promoted_to_section)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (student_id, academic_year_id) DO NOTHING
        `, [
          student.id, sid, from_year_id,
          student.grade, student.section || '',
          isGraduating ? null : nextGrade,
          now,
          student.school_roll_number ?? null,
          outcome,
          repeating ? (student.section || '') : (moveTo ?? (student.section || '')),
        ])
        snapshotted++
      } catch (e) {
        errors.push(`Snapshot failed for student ${student.id}: ${e}`)
        continue
      }

      // 2. Promote or graduate
      if (isGraduating) {
        await client.query(
          `UPDATE students SET status = 'graduated', school_roll_number = NULL WHERE id = $1`,
          [student.id]
        )
        graduated++
      } else if (repeating) {
        // Stays exactly where they are — grade, section and roll number untouched
        repeated++
      } else if (nextGrade) {
        const newSection = moveTo ?? student.section ?? null
        await client.query(
          `UPDATE students SET grade = $1, section = $2, school_roll_number = NULL WHERE id = $3`,
          [nextGrade, newSection, student.id]
        )
        if (student.school_roll_number != null) {
          rollBack.push({ id: student.id, grade: nextGrade, section: newSection, roll: student.school_roll_number })
        }
        if (moveTo) moved++
        promoted++
      } else {
        // grade not in sequence — leave as-is, just snapshot
        errors.push(`Grade "${student.grade}" not in grade_sequence — student ${student.id} not promoted`)
      }
    }

    // 2b. Hand roll numbers back where they are still free in the new class (deterministic: lowest roll first)
    for (const r of rollBack) {
      const { rowCount } = await client.query(
        `UPDATE students SET school_roll_number = $1
         WHERE id = $2
           AND NOT EXISTS (
             SELECT 1 FROM students o
             WHERE o.school_id = $3 AND o.grade = $4 AND o.section IS NOT DISTINCT FROM $5 AND o.school_roll_number = $1
           )`,
        [r.roll, r.id, sid, r.grade, r.section]
      )
      if (!rowCount) rollsCleared++
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
      repeated,
      moved,
      roll_numbers_cleared: rollsCleared,
      errors,
      message: `Rollover complete: ${promoted} promoted${moved > 0 ? ` (${moved} into a different section)` : ''}, ${repeated} repeating, ${graduated} graduated, ${snapshotted} records archived.` +
        (rollsCleared > 0 ? ` ${rollsCleared} student${rollsCleared === 1 ? '' : 's'} need a new class roll number (the old one is taken in the new class).` : ''),
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[academic-years/rollover]', err)
    return NextResponse.json({ error: 'Rollover failed — transaction rolled back, no data changed' }, { status: 500 })
  } finally {
    client.release()
  }
}

// GET /api/academic-years/rollover?school_id=&readiness=1
// Whether the school can run the rollover now: current + next year exist, the fee year-end is
// closed (when Fee Management is on) and the year has not been rolled over already.
//
// GET /api/academic-years/rollover?school_id=&student_id=
// Returns the full class history for a specific student — every year they were in school.
export async function GET(req: NextRequest) {
  const school_id  = req.nextUrl.searchParams.get('school_id')
  const student_id = req.nextUrl.searchParams.get('student_id')

  if (req.nextUrl.searchParams.get('readiness') === '1') {
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(await getRolloverReadiness(parseInt(school_id)))
  }

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = await pool.query(`
    SELECT
      sch.id,
      sch.grade,
      sch.section,
      sch.school_roll_number,
      sch.promoted_to_grade,
      sch.promoted_to_section,
      sch.outcome,
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
