import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'
import { awardPoints } from '@/lib/rewards'
import { getTeacherSession } from '@/lib/auth'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: task_id, sid } = await params
    const body = await req.json()
    const { school_id, teacher_id, score, feedback, status, resubmission_requested,
            file_url, file_name, file_public_id, file_size_kb } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const { rows: [task] } = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND school_id=$2', [task_id, school_id]
    )
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (teacher_id && task.teacher_id !== parseInt(teacher_id)) {
      return NextResponse.json({ error: 'Forbidden — only the task owner can review submissions' }, { status: 403 })
    }

    const { rows: [sub] } = await pool.query(
      'SELECT * FROM task_submissions WHERE id=$1 AND task_id=$2', [sid, task_id]
    )
    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    if (score !== undefined && score !== null && (score < 0 || score > task.max_marks)) {
      return NextResponse.json({ error: `Score must be between 0 and ${task.max_marks}` }, { status: 400 })
    }

    // Replace old Cloudinary file if a new one is uploaded
    if (file_public_id && sub.file_public_id && file_public_id !== sub.file_public_id) {
      try { await cloudinary.uploader.destroy(sub.file_public_id) } catch { /* ignore */ }
    }

    const newStatus = status || sub.status
    const now = new Date().toISOString()
    const reviewerId = newStatus === 'reviewed' ? (teacher_id ? parseInt(teacher_id) : null) : null

    const { rows: [updated] } = await pool.query(`
      UPDATE task_submissions SET
        score = $3,
        feedback = COALESCE($4, feedback),
        status = $5,
        resubmission_requested = COALESCE($6, resubmission_requested),
        file_url = COALESCE($7, file_url),
        file_name = COALESCE($8, file_name),
        file_public_id = COALESCE($9, file_public_id),
        file_size_kb = COALESCE($10, file_size_kb),
        reviewed_at = CASE WHEN $5 = 'reviewed' THEN $11 ELSE reviewed_at END,
        reviewed_by = CASE WHEN $5 = 'reviewed' THEN $12 ELSE reviewed_by END
      WHERE id=$1 AND task_id=$2
      RETURNING *
    `, [
      sid, task_id,
      score ?? sub.score,
      feedback ?? null,
      newStatus,
      resubmission_requested ?? sub.resubmission_requested,
      file_url ?? null, file_name ?? null, file_public_id ?? null, file_size_kb ?? null,
      newStatus === 'reviewed' ? now : null,
      reviewerId,
    ])

    // Award high-score points if score >= 80% of max_marks (non-blocking)
    if (newStatus === 'reviewed' && sub.status !== 'reviewed' && updated.score !== null) {
      const pct = updated.score / task.max_marks
      if (pct >= 0.8) {
        awardPoints(sub.student_id, parseInt(school_id), 'task_scored_high', parseInt(task_id), 'task').catch(() => {})
      }
    }

    // Notify student when task is reviewed (non-blocking)
    if (newStatus === 'reviewed' && sub.status !== 'reviewed') {
      try {
        const scoreText = updated.score !== null ? ` Score: ${updated.score}/${task.max_marks}.` : ''
        const resubText = updated.resubmission_requested ? ' Your teacher has requested a resubmission.' : ''
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
          VALUES ($1, $2, 'task_reviewed', $3, $4, $5)
        `, [
          school_id, sub.student_id,
          `Task reviewed — ${task.title}`,
          `Your submission for "${task.title}" has been reviewed.${scoreText}${resubText}`,
          JSON.stringify({ task_id: task_id, submission_id: sid }),
        ])
      } catch { /* non-critical */ }
    }

    return NextResponse.json(updated)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  try {

    const { id: task_id, sid } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const teacher_id = req.nextUrl.searchParams.get('teacher_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const { rows: [sub] } = await pool.query(
      `SELECT ts.*, t.teacher_id FROM task_submissions ts
       JOIN tasks t ON ts.task_id = t.id
       WHERE ts.id=$1 AND ts.task_id=$2 AND t.school_id=$3`,
      [sid, task_id, school_id]
    )
    if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (teacher_id && sub.teacher_id !== parseInt(teacher_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (sub.file_public_id) {
      try { await cloudinary.uploader.destroy(sub.file_public_id) } catch { /* ignore */ }
    }

    await pool.query('DELETE FROM task_submissions WHERE id=$1', [sid])
    return NextResponse.json({ message: 'Submission deleted' })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
