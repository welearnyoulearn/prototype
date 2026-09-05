import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { requireFeeAccess } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const classRes = await pool.query(
        `SELECT c.*, t.name AS class_teacher_name
         FROM classes c LEFT JOIN teachers t ON c.class_teacher_id = t.id
         WHERE c.id = $1`,
        [id]
      )
      if (!classRes.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!await requireFeeAccess(classRes.rows[0].school_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Get subjects from class_subjects (source of truth for what subjects are assigned)
      const subjectsRes = await pool.query(
        `SELECT cs.id, cs.subject_name, cs.teacher_id, cs.periods_per_week,
                t.name AS teacher_name
         FROM class_subjects cs
         LEFT JOIN teachers t ON t.id = cs.teacher_id
         WHERE cs.class_id = $1
         ORDER BY cs.subject_name`,
        [id]
      )
      const subjects = subjectsRes.rows

      return NextResponse.json({ ...classRes.rows[0], subjects })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch class' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const { rows: [existing] } = await pool.query('SELECT school_id FROM classes WHERE id = $1', [id])
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!await requireFeeAccess(existing.school_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const { class_teacher_id } = await req.json()
      const result = await pool.query(
        'UPDATE classes SET class_teacher_id = $1 WHERE id = $2 RETURNING *',
        [class_teacher_id || null, id]
      )
      if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      invalidateCache(`classes:${result.rows[0].school_id}`)
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/classes/[id]
// Body: { mode: 'deactivate' | 'reassign' | 'manual', targetClassId?: number }
// A class can't be removed while it still has active students without the
// admin explicitly saying what happens to them:
//   - deactivate:   active students in this class are set to status='inactive'
//   - reassign:     active students are moved to targetClassId (same grade,
//                    a different section — enforced below); their roll number
//                    must not collide in the target class
//   - manual:       caller is expected to have already moved/deactivated the
//                    students themselves; if any are still active, the class
//                    is NOT deleted — 409 with the current count so the UI
//                    can show the same 3-option choice again
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { rows: [cls] } = await pool.query('SELECT school_id, grade, section FROM classes WHERE id=$1', [id])
    if (!cls) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!await requireFeeAccess(cls.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let mode: string = 'deactivate'
    let targetClassId: number | undefined
    try {
      const body = await req.json()
      if (body?.mode) mode = body.mode
      if (body?.targetClassId) targetClassId = Number(body.targetClassId)
    } catch {
      // No body (or invalid JSON) — default to 'deactivate', matching the
      // route's original always-deactivate behavior for any older caller.
    }

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
      [cls.school_id, cls.grade, cls.section]
    )
    const activeStudentCount = count as number

    if (mode === 'manual') {
      if (activeStudentCount > 0) {
        return NextResponse.json({
          error: 'Students still active in this class',
          activeStudentCount,
        }, { status: 409 })
      }
      // Nothing to move/deactivate — fall through to the delete below.
    } else if (mode === 'reassign') {
      if (!targetClassId) return NextResponse.json({ error: 'targetClassId required for reassign' }, { status: 400 })
      const { rows: [target] } = await pool.query(
        'SELECT school_id, grade, section FROM classes WHERE id = $1 AND deleted_at IS NULL', [targetClassId]
      )
      if (!target) return NextResponse.json({ error: 'Target class not found' }, { status: 404 })
      if (target.school_id !== cls.school_id) return NextResponse.json({ error: 'Target class must be in the same school' }, { status: 400 })
      if (target.grade !== cls.grade) return NextResponse.json({ error: 'Target class must be the same grade' }, { status: 400 })
      if (target.section === cls.section) return NextResponse.json({ error: 'Target class must be a different section' }, { status: 400 })

      // A student's school_roll_number must stay unique within
      // (school_id, grade, section) — moving into a section where that roll
      // number is already taken would violate idx_students_school_roll_unique.
      // Surface those by name/roll instead of letting the UPDATE 500.
      const { rows: collisions } = await pool.query(
        `SELECT s.name, s.school_roll_number
         FROM students s
         WHERE s.school_id = $1 AND s.grade = $2 AND s.section = $3 AND s.status = 'active'
           AND s.school_roll_number IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM students t
             WHERE t.school_id = $1 AND t.grade = $4 AND t.section = $5
               AND t.school_roll_number = s.school_roll_number
           )`,
        [cls.school_id, cls.grade, cls.section, target.grade, target.section]
      )
      if (collisions.length > 0) {
        return NextResponse.json({
          error: `Roll number already taken in the target section for: ${collisions.map(c => `${c.name} (#${c.school_roll_number})`).join(', ')}. Resolve these first.`,
        }, { status: 409 })
      }

      await pool.query(
        `UPDATE students SET grade = $4, section = $5 WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [cls.school_id, cls.grade, cls.section, target.grade, target.section]
      )
      invalidateCache(`classes:${target.school_id}`)
    } else {
      // deactivate (default)
      await pool.query(
        `UPDATE students SET status = 'inactive' WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [cls.school_id, cls.grade, cls.section]
      )
    }

    // The class row itself is soft-deleted (deleted_at) so it can still show
    // up in "Removed" and be restored — but until now the rows describing
    // what that class actually taught (class_subjects, class_timetable,
    // substitute_assignments) were hard-deleted right here regardless, so a
    // restored class came back with no memory of its own subjects/timetable.
    // Unlink instead, matching the same never-destroy-history pattern used
    // for teacher removal: clear the live/actionable teacher assignments,
    // keep every row.
    await pool.query('UPDATE class_timetable SET teacher_id = NULL, is_manual = FALSE WHERE class_id = $1', [id])
    await pool.query('UPDATE class_subjects SET teacher_id = NULL WHERE class_id = $1', [id])
    await pool.query('UPDATE substitute_assignments SET original_teacher_id = NULL WHERE class_id = $1 AND original_teacher_id IS NOT NULL', [id])
    await pool.query('UPDATE substitute_assignments SET substitute_teacher_id = NULL WHERE class_id = $1 AND substitute_teacher_id IS NOT NULL', [id])

    // Soft-delete: mark deleted_at instead of hard deleting so it appears in "Removed" list
    await pool.query('UPDATE classes SET deleted_at = NOW() WHERE id = $1', [id])

    invalidateCache(`classes:${cls.school_id}`)
    invalidateCache(`timetable:school:${cls.school_id}`)
    invalidateCache(`health:${cls.school_id}`)
    invalidateCache(`timetable:class:${id}`)
    invalidateCache(`subjects:class:${id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
  }
}
