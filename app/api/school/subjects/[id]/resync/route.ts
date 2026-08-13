import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/school/subjects/[id]/resync
//
// A school subscription (POST /api/school/subscribe) clones master chapters
// into school_chapters at subscribe time — it's a one-shot copy, not a live
// join. If platform-admin adds chapters to the master catalog afterward, a
// subscribed school never sees them. This route diffs school_chapters against
// master_chapters (by master_chapter_id) and clones whatever is missing,
// using the same copy logic as the initial subscribe.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schoolSubjectId = Number(id)
  if (!schoolSubjectId || Number.isNaN(schoolSubjectId)) {
    return NextResponse.json({ error: 'Invalid school subject id' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    const subjRes = await client.query('SELECT * FROM school_subjects WHERE id = $1', [schoolSubjectId])
    if (subjRes.rowCount === 0) {
      return NextResponse.json({ error: 'School subject not found' }, { status: 404 })
    }
    const schoolSubject = subjRes.rows[0]
    if (!await requireFeeAccess(schoolSubject.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!schoolSubject.master_subject_id) {
      return NextResponse.json({ error: 'This subject has no linked master template — nothing to sync.' }, { status: 400 })
    }

    await client.query('BEGIN')

    const masterChapsRes = await client.query(
      'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
      [schoolSubject.master_subject_id],
    )

    const clonedRes = await client.query(
      'SELECT master_chapter_id FROM school_chapters WHERE school_subject_id = $1 AND master_chapter_id IS NOT NULL',
      [schoolSubjectId],
    )
    const clonedIds = new Set(clonedRes.rows.map((r) => r.master_chapter_id))

    const missingChapters = masterChapsRes.rows.filter((ch) => !clonedIds.has(ch.id))

    let chaptersAdded = 0
    let topicsAdded = 0

    for (const masterChap of missingChapters) {
      const schoolChapRes = await client.query(
        `INSERT INTO school_chapters (school_subject_id, master_chapter_id, chapter_name, chapter_order, is_custom, semester, book_type, audience, book_name)
         VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8)
         RETURNING id`,
        [schoolSubjectId, masterChap.id, masterChap.chapter_name, masterChap.chapter_order, masterChap.semester, masterChap.book_type, masterChap.audience, masterChap.book_name],
      )
      const schoolChapterId = schoolChapRes.rows[0].id
      chaptersAdded += 1

      const masterTopicsRes = await client.query(
        'SELECT * FROM master_topics WHERE chapter_id = $1 ORDER BY topic_order, id',
        [masterChap.id],
      )

      const topicIdMap: Record<number, number> = {}

      for (const masterTopic of masterTopicsRes.rows) {
        const schoolTopicRes = await client.query(
          `INSERT INTO school_topics (school_chapter_id, master_topic_id, topic_name, topic_order, content_text, content_pdf_url, questions, subtopics, is_custom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
           RETURNING id`,
          [schoolChapterId, masterTopic.id, masterTopic.topic_name, masterTopic.topic_order, masterTopic.content_text, masterTopic.content_pdf_url, JSON.stringify(masterTopic.questions || []), JSON.stringify(masterTopic.subtopics || [])],
        )
        const schoolTopicId = schoolTopicRes.rows[0].id
        topicIdMap[masterTopic.id] = schoolTopicId
        topicsAdded += 1

        const masterResRes = await client.query(
          'SELECT * FROM master_resources WHERE topic_id = $1 ORDER BY id',
          [masterTopic.id],
        )
        for (const masterRes of masterResRes.rows) {
          await client.query(
            `INSERT INTO school_resources (school_topic_id, master_resource_id, resource_type, title, url, is_custom)
             VALUES ($1, $2, $3, $4, $5, FALSE)`,
            [schoolTopicId, masterRes.id, masterRes.resource_type, masterRes.title, masterRes.url],
          )
        }
      }

      const masterTasksRes = await client.query(
        'SELECT * FROM master_tasks WHERE chapter_id = $1 ORDER BY id',
        [masterChap.id],
      )
      for (const masterTask of masterTasksRes.rows) {
        const targetSchoolTopicId = masterTask.topic_id ? topicIdMap[masterTask.topic_id] : null
        await client.query(
          `INSERT INTO school_tasks (school_chapter_id, school_topic_id, master_task_id, title, instructions, task_type, max_marks, is_mandatory, is_active, is_custom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, FALSE)`,
          [
            schoolChapterId,
            targetSchoolTopicId,
            masterTask.id,
            masterTask.title,
            masterTask.instructions,
            masterTask.task_type,
            masterTask.max_marks,
            masterTask.is_mandatory,
          ],
        )
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true, chapters_added: chaptersAdded, topics_added: topicsAdded })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('school subject resync POST error:', err)
    return NextResponse.json({ error: 'Failed to sync new chapters' }, { status: 500 })
  } finally {
    client.release()
  }
}
