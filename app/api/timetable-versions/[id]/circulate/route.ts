import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { notifyTimetableChange } from '@/lib/notifyTimetable'

// POST /api/timetable-versions/[id]/circulate
//
// Marks the version as circulated and notifies all teachers + students.
// Only one version can be circulated at a time.
// Before circulating, the version must be confirmed (status = 'confirmed').

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const { id } = await params
  const versionId = Number(id)

  try {
    const body = await req.json().catch(() => ({}))
    const { school_id, force = false } = body as { school_id?: number; force?: boolean }

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Fetch the version
      const { rows: [version] } = await client.query(
        `SELECT * FROM timetable_versions WHERE id=$1 AND school_id=$2`,
        [versionId, school_id]
      )
      if (!version) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Version not found' }, { status: 404 })
      }

      // Must be confirmed first (unless force=true for drafts)
      if (!force && version.status === 'draft') {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: 'Version must be confirmed before circulating. Use force=true to skip confirmation.',
        }, { status: 400 })
      }

      // Check for blocking conflicts before circulating
      const { rows: conflictRows } = await client.query(
        `SELECT COUNT(*) AS cnt
         FROM (
           SELECT ct.teacher_id, ct.day_of_week, ct.period_number
           FROM class_timetable ct
           WHERE ct.school_id=$1 AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
           GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
           HAVING COUNT(*) > 1
         ) sub`,
        [school_id]
      )
      const blockingConflicts = Number(conflictRows[0]?.cnt || 0)

      // Check if any master classes have conflicts
      if (blockingConflicts > 0 && !force) {
        const { rows: masterConflicts } = await client.query(
          `SELECT COUNT(*) AS cnt
           FROM (
             SELECT ct.teacher_id, ct.day_of_week, ct.period_number
             FROM class_timetable ct
             JOIN class_timetable_modes ctm ON ctm.class_id = ct.class_id
             WHERE ct.school_id=$1 AND ct.teacher_id IS NOT NULL AND ct.is_break=FALSE
               AND ctm.mode IN ('master', 'slave')
             GROUP BY ct.teacher_id, ct.day_of_week, ct.period_number
             HAVING COUNT(*) > 1
           ) sub`,
          [school_id]
        )
        if (Number(masterConflicts[0]?.cnt || 0) > 0) {
          await client.query('ROLLBACK')
          return NextResponse.json({
            error: 'Cannot circulate: blocking conflicts exist in Master/Slave classes. Resolve conflicts first.',
            blocking_conflicts: Number(masterConflicts[0]?.cnt || 0),
          }, { status: 409 })
        }
      }

      // De-activate any previously circulated version
      await client.query(
        `UPDATE timetable_versions SET is_active=FALSE WHERE school_id=$1 AND is_active=TRUE`,
        [school_id]
      )

      // Activate this version
      await client.query(
        `UPDATE timetable_versions
         SET status='circulated', is_active=TRUE, circulated_at=NOW()
         WHERE id=$1`,
        [versionId]
      )

      // Fetch all classes with timetables to notify
      const { rows: classes } = await client.query(
        `SELECT DISTINCT ct.class_id, c.grade, c.section
         FROM class_timetable ct
         JOIN classes c ON c.id = ct.class_id
         WHERE ct.school_id=$1 AND ct.is_break=FALSE`,
        [school_id]
      )

      await client.query('COMMIT')

      // Send notifications after commit
      try {
        for (const cls of classes) {
          const { rows: teacherRows } = await pool.query(
            `SELECT DISTINCT teacher_id FROM class_timetable
             WHERE class_id=$1 AND teacher_id IS NOT NULL AND is_break=FALSE`,
            [cls.class_id]
          )
          await notifyTimetableChange(pool, {
            school_id,
            class_id: cls.class_id,
            grade: cls.grade,
            section: cls.section,
            teacher_ids: teacherRows.map((r: { teacher_id: number }) => r.teacher_id),
            title: 'Timetable Circulated',
            message: `Updated timetable "${version.name}" is now live for Grade ${cls.grade}-${cls.section}.`,
          })
        }
      } catch (notifErr) {
        console.error('[circulate] notification error (non-fatal):', notifErr)
      }

      return NextResponse.json({
        success: true,
        version_id: versionId,
        version_name: version.name,
        classes_notified: classes.length,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to circulate version' }, { status: 500 })
  }
}
