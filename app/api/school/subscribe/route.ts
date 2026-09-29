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
    if (!academic_year) academic_year = await resolveAcademicYear(school_id)

    // Start a database transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

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

      // 4-6. Copy the complete hierarchy in four set-based statements. This
      // keeps subscription time proportional to data volume without issuing
      // one round trip per chapter/topic/resource/task.
      await client.query(
        `INSERT INTO school_chapters
           (school_subject_id, master_chapter_id, chapter_name, chapter_order, is_custom, semester, book_type, audience, book_name)
         SELECT $1, mc.id, mc.chapter_name, mc.chapter_order, FALSE,
                mc.semester, mc.book_type, mc.audience, mc.book_name
           FROM master_chapters mc
          WHERE mc.subject_id = $2
          ORDER BY mc.chapter_order, mc.id`,
        [schoolSubjectId, master_subject_id],
      )
      await client.query(
        `INSERT INTO school_topics
           (school_chapter_id, master_topic_id, topic_name, topic_order, content_text, content_pdf_url, questions, subtopics, is_custom)
         SELECT sc.id, mt.id, mt.topic_name, mt.topic_order, mt.content_text,
                mt.content_pdf_url, COALESCE(mt.questions, '[]'::jsonb),
                COALESCE(mt.subtopics, '[]'::jsonb), FALSE
           FROM master_topics mt
           JOIN school_chapters sc ON sc.master_chapter_id = mt.chapter_id AND sc.school_subject_id = $1
          ORDER BY mt.topic_order, mt.id`,
        [schoolSubjectId],
      )
      await client.query(
        `INSERT INTO school_resources
           (school_topic_id, master_resource_id, resource_type, title, url, is_custom)
         SELECT st.id, mr.id, mr.resource_type, mr.title, mr.url, FALSE
           FROM master_resources mr
           JOIN school_topics st ON st.master_topic_id = mr.topic_id
           JOIN school_chapters sc ON sc.id = st.school_chapter_id AND sc.school_subject_id = $1`,
        [schoolSubjectId],
      )
      await client.query(
        `INSERT INTO school_tasks
           (school_chapter_id, school_topic_id, master_task_id, title, instructions, task_type, max_marks, is_mandatory, is_active, is_custom)
         SELECT sc.id, st.id, mt.id, mt.title, mt.instructions, mt.task_type,
                mt.max_marks, mt.is_mandatory, TRUE, FALSE
           FROM master_tasks mt
           JOIN school_chapters sc ON sc.master_chapter_id = mt.chapter_id AND sc.school_subject_id = $1
           LEFT JOIN school_topics st ON st.master_topic_id = mt.topic_id AND st.school_chapter_id = sc.id`,
        [schoolSubjectId],
      )

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
    const message = err instanceof Error ? err.message : 'Failed to subscribe to master subject'
    return NextResponse.json({ error: message }, { status: message.startsWith('School is already subscribed') ? 409 : 500 })
  }
}
