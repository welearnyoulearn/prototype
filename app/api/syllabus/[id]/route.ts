import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSyllabusWriteAccess } from '@/lib/auth'

// PATCH /api/syllabus/[id] — update status, target dates, delay reasons, topic details
// Body: { school_id, class_id?, status?, covered_by?, topic_name?, topic_order?,
//         target_date?, delay_reason? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id } = await params
  const body = await req.json()
  const {
    school_id, class_id, status, covered_by,
    topic_name, topic_order,
    target_date, delay_reason,
  } = body

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const isUpdatingProgress = (
      status !== undefined ||
      target_date !== undefined ||
      delay_reason !== undefined
    )

    if (isUpdatingProgress && !class_id) {
      return NextResponse.json({ error: 'class_id required to update topic progress status' }, { status: 400 })
    }

    let progressResult = null

    // 1. Handle section-specific progress updates in school_topic_progress
    if (isUpdatingProgress) {
      // Fetch existing progress first to merge values
      const { rows: existingProgress } = await pool.query(
        'SELECT * FROM school_topic_progress WHERE class_id = $1 AND school_topic_id = $2',
        [class_id, id]
      )
      const current = existingProgress[0] || {}

      // Calculate status and dates
      let newStatus = status !== undefined ? status : (current.status || 'pending')
      let newCoveredDate = current.covered_date
      let newCoveredBy = current.covered_by

      if (status !== undefined) {
        if (status === 'covered') {
          newCoveredDate = current.covered_date || new Date().toISOString().slice(0, 10)
          newCoveredBy = covered_by !== undefined ? covered_by : (current.covered_by || null)
        } else {
          newCoveredDate = null
          newCoveredBy = null
        }
      }

      const newTargetDate = target_date !== undefined ? (target_date || null) : (current.target_date || null)
      const newDelayReason = delay_reason !== undefined ? (delay_reason || null) : (current.delay_reason || null)

      // Upsert into school_topic_progress
      const upsertRes = await pool.query(
        `INSERT INTO school_topic_progress (
          class_id, school_topic_id, status, covered_date, covered_by,
          target_date, delay_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (class_id, school_topic_id) DO UPDATE SET
           status = EXCLUDED.status,
           covered_date = EXCLUDED.covered_date,
           covered_by = EXCLUDED.covered_by,
           target_date = EXCLUDED.target_date,
           delay_reason = EXCLUDED.delay_reason
         RETURNING *`,
        [
          class_id, id, newStatus, newCoveredDate, newCoveredBy,
          newTargetDate, newDelayReason
        ]
      )
      progressResult = upsertRes.rows[0]
    }

    // 2. Handle topic-specific properties in school_topics
    let topicResult = null
    const isUpdatingTopic = (topic_name !== undefined || topic_order !== undefined)

    if (isUpdatingTopic) {
      // Verify topic exists and is custom if they are trying to rename it
      const { rows: [topicRow] } = await pool.query(
        'SELECT * FROM school_topics WHERE id = $1',
        [id]
      )

      if (!topicRow) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
      }

      if (topic_name !== undefined && !topicRow.is_custom) {
        return NextResponse.json({ error: 'Cannot rename a board-mandated topic' }, { status: 403 })
      }

      const setClauses: string[] = []
      const args: (string | number)[] = []

      if (topic_name !== undefined) {
        args.push(topic_name)
        setClauses.push(`topic_name = $${args.length}`)
      }
      if (topic_order !== undefined) {
        args.push(topic_order)
        setClauses.push(`topic_order = $${args.length}`)
      }

      if (setClauses.length > 0) {
        args.push(id)
        const updateRes = await pool.query(
          `UPDATE school_topics SET ${setClauses.join(', ')} WHERE id = $${args.length} RETURNING *`,
          args
        )
        topicResult = updateRes.rows[0]
      }
    }

    if (!isUpdatingProgress && !isUpdatingTopic) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      progress: progressResult,
      topic: topicResult,
    })
  } catch (err) {
    console.error('Syllabus PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 })
  }
}

// DELETE /api/syllabus/[id]?school_id= — delete a custom topic
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // 1. Fetch topic
    const { rows: [topicRow] } = await pool.query(
      'SELECT * FROM school_topics WHERE id = $1',
      [id]
    )

    if (!topicRow) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }

    // Guardrail: Locked board topics cannot be deleted
    if (!topicRow.is_custom) {
      return NextResponse.json({ error: 'Cannot delete a board-mandated topic' }, { status: 403 })
    }

    // 2. Perform delete
    await pool.query(
      'DELETE FROM school_topics WHERE id = $1',
      [id]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Syllabus DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 })
  }
}
