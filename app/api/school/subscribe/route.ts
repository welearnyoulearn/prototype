import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { matchTeacher } from '@/lib/matchTeacher'
import { invalidateCache } from '@/lib/responseCache'
import { requireFeeAccess } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'

// POST /api/school/subscribe
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, master_subject_id } = body
    let academic_year = body.academic_year

    if (!school_id || !master_subject_id) {
      return NextResponse.json({ error: 'school_id and master_subject_id are required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Start a database transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (!academic_year) {
        academic_year = await resolveAcademicYear(school_id)
      }

      // 1. Fetch master subject details
      const masterSubRes = await client.query('SELECT * FROM master_subjects WHERE id = $1', [master_subject_id])
      if (masterSubRes.rows.length === 0) {
        throw new Error('Master subject not found')
      }
      const masterSub = masterSubRes.rows[0]

      // 2. Check if already subscribed
      const existingSub = await client.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
        [school_id, masterSub.grade, masterSub.subject_name, academic_year]
      )
      if (existingSub.rows.length > 0) {
        throw new Error(`School is already subscribed to ${masterSub.subject_name} for Grade ${masterSub.grade} (Year ${academic_year})`)
      }

      // 3. Create school subject
      const schoolSubRes = await client.query(
        `INSERT INTO school_subjects (school_id, master_subject_id, subject_name, board, grade, academic_year, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [school_id, master_subject_id, masterSub.subject_name, masterSub.board, masterSub.grade, academic_year, masterSub.category]
      )
      const schoolSubjectId = schoolSubRes.rows[0].id

      // 4. Fetch and copy chapters
      const masterChapsRes = await client.query(
        'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
        [master_subject_id]
      )

      for (const masterChap of masterChapsRes.rows) {
        const schoolChapRes = await client.query(
          `INSERT INTO school_chapters (school_subject_id, master_chapter_id, chapter_name, chapter_order, is_custom, semester, book_type, audience, book_name)
           VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8)
           RETURNING id`,
          [schoolSubjectId, masterChap.id, masterChap.chapter_name, masterChap.chapter_order, masterChap.semester, masterChap.book_type, masterChap.audience, masterChap.book_name]
        )
        const schoolChapterId = schoolChapRes.rows[0].id

        // 5. Fetch and copy topics for this chapter
        const masterTopicsRes = await client.query(
          'SELECT * FROM master_topics WHERE chapter_id = $1 ORDER BY topic_order, id',
          [masterChap.id]
        )

        // Store map of master_topic_id -> school_topic_id to map tasks properly
        const topicIdMap: Record<number, number> = {}

        for (const masterTopic of masterTopicsRes.rows) {
          const schoolTopicRes = await client.query(
            `INSERT INTO school_topics (school_chapter_id, master_topic_id, topic_name, topic_order, content_text, content_pdf_url, questions, subtopics, is_custom)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
             RETURNING id`,
            [schoolChapterId, masterTopic.id, masterTopic.topic_name, masterTopic.topic_order, masterTopic.content_text, masterTopic.content_pdf_url, JSON.stringify(masterTopic.questions || []), JSON.stringify(masterTopic.subtopics || [])]
          )
          const schoolTopicId = schoolTopicRes.rows[0].id
          topicIdMap[masterTopic.id] = schoolTopicId

          // Copy resources
          const masterResRes = await client.query(
            'SELECT * FROM master_resources WHERE topic_id = $1 ORDER BY id',
            [masterTopic.id]
          )

          for (const masterRes of masterResRes.rows) {
            await client.query(
              `INSERT INTO school_resources (school_topic_id, master_resource_id, resource_type, title, url, is_custom)
               VALUES ($1, $2, $3, $4, $5, FALSE)`,
              [schoolTopicId, masterRes.id, masterRes.resource_type, masterRes.title, masterRes.url]
            )
          }
        }

        // 6. Fetch and copy tasks for this chapter
        const masterTasksRes = await client.query(
          'SELECT * FROM master_tasks WHERE chapter_id = $1 ORDER BY id',
          [masterChap.id]
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
              masterTask.is_mandatory
            ]
          )
        }
      }

      // 7. Auto-assign this subject to EVERY existing class of this grade —
      // not just whatever the admin happened to check in the Subscribe
      // modal's class-picker. A class left unchecked there (or simply not
      // created yet at subscribe time) used to never catch up on its own,
      // permanently stuck on Class Management's manual "click to add"
      // suggestion list even though the subject was genuinely subscribed
      // for its grade. The modal's own class_ids selection still exists for
      // the UI (it drives which sections get a *pre-picked* teacher
      // highlighted there), but assignment itself is no longer gated on it —
      // every class of the grade gets the subject, matching exactly what
      // POST /api/classes already does for a class created AFTER a subject
      // is subscribed.
      const { rows: gradeClasses } = await client.query(
        'SELECT id, grade FROM classes WHERE school_id = $1 AND grade = $2 AND deleted_at IS NULL',
        [school_id, masterSub.grade]
      )
      if (gradeClasses.length > 0) {
        const { rows: staff } = await client.query(
          `SELECT id, subject, teaches_grades FROM teachers
           WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
             AND subject IS NOT NULL AND subject != ''`,
          [school_id]
        )

        for (const classObj of gradeClasses) {
          // Filter by teaches_grades
          const eligible = staff.filter(t => {
            if (!t.teaches_grades) return true
            const allowed = t.teaches_grades.split(',').map((g: string) => g.trim().toUpperCase())
            return allowed.includes(classObj.grade.toUpperCase())
          })

          const resolvedTeacherId = matchTeacher(masterSub.subject_name.trim(), eligible.length > 0 ? eligible : staff)

          await client.query(
            `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
             VALUES ($1, $2, $3, 4)
             ON CONFLICT (class_id, subject_name) DO UPDATE
               SET teacher_id = EXCLUDED.teacher_id, periods_per_week = EXCLUDED.periods_per_week`,
            [classObj.id, masterSub.subject_name.trim(), resolvedTeacherId]
          )

          invalidateCache(`subjects:class:${classObj.id}`)
          invalidateCache(`timetable:class:${classObj.id}`)
        }
        invalidateCache(`health:${school_id}`)
      }

      await client.query('COMMIT')
      client.release()

      return NextResponse.json({ ok: true, school_subject_id: schoolSubjectId })
    } catch (err: unknown) {
      await client.query('ROLLBACK')
      client.release()
      throw err
    }
  } catch (err: unknown) {
    console.error('School subscribe POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to subscribe to master subject' }, { status: 500 })
  }
}
