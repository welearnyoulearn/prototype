import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// DELETE /api/school/subjects/[id]
//
// Removes a school's subscription to a subject (school-side only — never
// touches master_subjects/master_chapters/etc., which are platform-admin's
// catalog). Refused once any class has real data against it: a completed
// Class Syllabus Setup, or any topic actually marked taught. Those represent
// real teaching work a school admin could otherwise destroy in one click —
// the fix for "wrong subject" at that point is Curriculum Customizer's
// existing Subscribe/carry-forward flow for a fresh academic year, not a
// delete that cascades away progress. A subject with no such data (freshly
// subscribed, never set up by any teacher) deletes cleanly — the FK chain
// (school_subjects -> school_chapters -> school_topics -> school_resources/
// school_tasks, and class_chapter_visibility/class_topic_visibility/
// class_subject_setup_status keyed off chapter/topic/subject ids) is all
// ON DELETE CASCADE, so nothing but this one subscription and its own empty
// shell of chapters/topics goes away.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schoolSubjectId = Number(id)
  if (!schoolSubjectId || Number.isNaN(schoolSubjectId)) {
    return NextResponse.json({ error: 'Invalid school subject id' }, { status: 400 })
  }

  try {
    const subjRes = await pool.query('SELECT * FROM school_subjects WHERE id = $1', [schoolSubjectId])
    if (subjRes.rowCount === 0) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const subject = subjRes.rows[0]
    if (!await requireFeeAccess(subject.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const setupRes = await pool.query(
      `SELECT 1 FROM class_subject_setup_status
       WHERE school_subject_id = $1 AND setup_completed_at IS NOT NULL LIMIT 1`,
      [schoolSubjectId]
    )
    if ((setupRes.rowCount ?? 0) > 0) {
      return NextResponse.json({
        error: 'At least one class has already completed Syllabus Setup for this subject — it can’t be deleted while real teaching data exists.',
      }, { status: 409 })
    }

    const taughtRes = await pool.query(
      `SELECT 1 FROM school_topic_progress stp
       JOIN school_topics st ON st.id = stp.school_topic_id
       JOIN school_chapters sc ON sc.id = st.school_chapter_id
       WHERE sc.school_subject_id = $1 AND stp.status = 'covered' LIMIT 1`,
      [schoolSubjectId]
    )
    if ((taughtRes.rowCount ?? 0) > 0) {
      return NextResponse.json({
        error: 'At least one topic in this subject has already been marked taught — it can’t be deleted while real teaching data exists.',
      }, { status: 409 })
    }

    await pool.query('DELETE FROM school_subjects WHERE id = $1', [schoolSubjectId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('school subject DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
  }
}
