import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/school/subjects/copy-from-year
// Body: { school_id, source_school_subject_id, target_academic_year }
//
// The other half of the new-academic-year choice alongside subscribing fresh
// from the master template (POST /api/school/subscribe): clone a subject
// AS-IS from a prior year into the target year, chapters/topics/resources
// included, custom content and all — so a school admin whose syllabus barely
// changes year to year isn't forced to either re-subscribe from scratch
// (losing any custom chapters/topics added last year) or have teachers
// re-enter everything by hand. Deliberately does NOT touch class_subjects/
// teacher auto-assign — that's Class Management's job for the new year's
// classes, not this route's.
//
// Does not copy school_tasks — the Custom Task flow was removed from the
// Syllabus Customizer; nothing in the target year's tree needs a tasks table
// populated for it to work.
export async function POST(req: NextRequest) {
  try {
    const { school_id, source_school_subject_id, target_academic_year } = await req.json()
    if (!school_id || !source_school_subject_id || !target_academic_year) {
      return NextResponse.json({ error: 'school_id, source_school_subject_id, target_academic_year are required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: [source] } = await client.query(
        `SELECT * FROM school_subjects WHERE id = $1 AND school_id = $2`,
        [source_school_subject_id, school_id]
      )
      if (!source) throw new Error('Source subject not found')
      if (source.academic_year === target_academic_year) {
        throw new Error('Source and target academic year are the same')
      }

      const { rows: [existing] } = await client.query(
        `SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4`,
        [school_id, source.grade, source.subject_name, target_academic_year]
      )
      if (existing) {
        throw new Error(`${source.subject_name} already exists for Grade ${source.grade} in ${target_academic_year}`)
      }

      const { rows: [newSubject] } = await client.query(
        `INSERT INTO school_subjects (school_id, master_subject_id, subject_name, board, grade, academic_year, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [school_id, source.master_subject_id, source.subject_name, source.board, source.grade, target_academic_year, source.category]
      )
      const newSubjectId = newSubject.id

      const { rows: sourceChapters } = await client.query(
        `SELECT * FROM school_chapters WHERE school_subject_id = $1 ORDER BY chapter_order, id`,
        [source_school_subject_id]
      )

      for (const chap of sourceChapters) {
        const { rows: [newChap] } = await client.query(
          `INSERT INTO school_chapters (school_subject_id, master_chapter_id, chapter_name, chapter_order, is_custom, semester, book_type, audience, book_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [newSubjectId, chap.master_chapter_id, chap.chapter_name, chap.chapter_order, chap.is_custom, chap.semester, chap.book_type, chap.audience, chap.book_name]
        )
        const newChapterId = newChap.id

        const { rows: sourceTopics } = await client.query(
          `SELECT * FROM school_topics WHERE school_chapter_id = $1 ORDER BY topic_order, id`,
          [chap.id]
        )

        for (const topic of sourceTopics) {
          const { rows: [newTopic] } = await client.query(
            `INSERT INTO school_topics (school_chapter_id, master_topic_id, topic_name, topic_order, content_text, content_pdf_url, questions, subtopics, is_custom)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [newChapterId, topic.master_topic_id, topic.topic_name, topic.topic_order, topic.content_text, topic.content_pdf_url, JSON.stringify(topic.questions || []), JSON.stringify(topic.subtopics || []), topic.is_custom]
          )
          const newTopicId = newTopic.id

          const { rows: sourceResources } = await client.query(
            `SELECT * FROM school_resources WHERE school_topic_id = $1 ORDER BY id`,
            [topic.id]
          )
          for (const res of sourceResources) {
            await client.query(
              `INSERT INTO school_resources (school_topic_id, master_resource_id, resource_type, title, url, is_custom)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [newTopicId, res.master_resource_id, res.resource_type, res.title, res.url, res.is_custom]
            )
          }
        }
      }

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, school_subject_id: newSubjectId, chapters_copied: sourceChapters.length })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    console.error('[API] copy-from-year', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to copy subject' }, { status: 500 })
  }
}
