import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { ALL_BOARDS } from '../lib/board-syllabus/data'

async function seed() {
  const pg = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  console.log('Seeding Master Syllabus...')
  try {
    // 1. Clean existing master data (cascading will delete chapters, topics, resources, tasks)
    console.log('Clearing old master data...')
    await pool.query('DELETE FROM master_subjects')

    // 2. Loop over each board and seed
    for (const boardData of ALL_BOARDS) {
      console.log(`Seeding Board: ${boardData.board} (${boardData.label})...`)
      for (const gradeEntry of boardData.grades) {
        console.log(`  Grade: ${gradeEntry.grade}...`)
        for (const subjectEntry of gradeEntry.subjects) {
          // Insert subject
          const subRes = await pool.query(
            `INSERT INTO master_subjects (board, grade, subject_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (board, grade, subject_name) 
             DO UPDATE SET updated_at = NOW() 
             RETURNING id`,
            [boardData.board, gradeEntry.grade, subjectEntry.subject]
          )
          const subjectId = subRes.rows[0].id

          for (const chapterEntry of subjectEntry.chapters) {
            // Insert chapter
            const chapRes = await pool.query(
              `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [subjectId, chapterEntry.chapter_name, chapterEntry.chapter_order, `Master syllabus content for ${chapterEntry.chapter_name}`]
            )
            const chapterId = chapRes.rows[0].id

            // Let's seed a couple of master tasks for this chapter
            // Mandatory Task (e.g. Government Mandated)
            await pool.query(
              `INSERT INTO master_tasks (chapter_id, title, instructions, task_type, max_marks, is_mandatory)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                chapterId,
                `${chapterEntry.chapter_name} - Mandatory Board Assignment`,
                `Complete all questions in the official worksheet for ${chapterEntry.chapter_name}. This is a mandatory task required by the board.`,
                'homework',
                10,
                true // is_mandatory
              ]
            )

            // Optional Task (e.g. Recommended Practice)
            await pool.query(
              `INSERT INTO master_tasks (chapter_id, title, instructions, task_type, max_marks, is_mandatory)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                chapterId,
                `${chapterEntry.chapter_name} - Recommended Practice Quiz`,
                `Solve this self-assessment quiz to test your understanding of ${chapterEntry.chapter_name}. This is an optional task.`,
                'test',
                10,
                false // optional
              ]
            )

            for (const topicEntry of chapterEntry.topics) {
              // Insert topic
              const topicRes = await pool.query(
                `INSERT INTO master_topics (chapter_id, topic_name, topic_order, content_text)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [
                  chapterId,
                  topicEntry.topic_name,
                  topicEntry.topic_order,
                  `This is the detailed study material and curriculum text for topic: "${topicEntry.topic_name}". Learn the fundamentals and prepare for assessments.`
                ]
              )
              const topicId = topicRes.rows[0].id

              // Seed some resources for this topic to make it rich
              // 1. YouTube video
              await pool.query(
                `INSERT INTO master_resources (topic_id, resource_type, title, url)
                 VALUES ($1, $2, $3, $4)`,
                [
                  topicId,
                  'video',
                  `Learn ${topicEntry.topic_name} - Video Lesson`,
                  `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
                ]
              )

              // 2. Google Doc lesson plan or reference guide
              await pool.query(
                `INSERT INTO master_resources (topic_id, resource_type, title, url)
                 VALUES ($1, $2, $3, $4)`,
                [
                  topicId,
                  'gdoc',
                  `${topicEntry.topic_name} - Lesson Plan / Reference Guide`,
                  `https://docs.google.com/document/d/1t1_SMC4O3wX7YqG5N_ZgY_Lw6XgH7yB3a5c7_d6K6m4/edit`
                ]
              )
            }
          }
        }
      }
    }
    console.log('✅ Master syllabus seeding completed successfully!');
  } catch (err) {
    console.error('❌ Error seeding master syllabus:', err)
  } finally {
    await pool.end()
  }
}

seed().then(() => process.exit(0))
