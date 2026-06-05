import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/school/subjects?school_id=&class_id=&subject_name=&include_details=
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const subject_name = req.nextUrl.searchParams.get('subject_name')
  const includeDetails = req.nextUrl.searchParams.get('include_details') === 'true'

  if (!school_id) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 })
  }

  try {
    let academic_year = req.nextUrl.searchParams.get('academic_year')
    if (!academic_year) {
      const activeYearRes = await pool.query(
        'SELECT label FROM academic_years WHERE school_id = $1 AND is_current = TRUE LIMIT 1',
        [school_id]
      )
      if ((activeYearRes.rowCount ?? 0) > 0) {
        academic_year = activeYearRes.rows[0].label
      } else {
        academic_year = '2025-26'
      }
    }

    let query = 'SELECT * FROM school_subjects WHERE school_id = $1 AND academic_year = $2'
    const args: any[] = [school_id, academic_year]

    if (subject_name) {
      query += ' AND subject_name = $3'
      args.push(subject_name)
    }

    query += ' ORDER BY grade, subject_name'

    const { rows: subjects } = await pool.query(query, args)

    if (includeDetails) {
      for (const sub of subjects) {
        // Fetch school chapters
        const { rows: chapters } = await pool.query(
          'SELECT * FROM school_chapters WHERE school_subject_id = $1 ORDER BY chapter_order, id',
          [sub.id]
        )

        for (const chap of chapters) {
          // Fetch school topics, optionally joining progress
          let topicsQuery = `
            SELECT st.*, 
                   stp.status AS progress_status, 
                   stp.covered_date,
                   stp.covered_by,
                   t.name AS covered_by_name
            FROM school_topics st
            LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = $2
            LEFT JOIN teachers t ON t.id = stp.covered_by
            WHERE st.school_chapter_id = $1 
            ORDER BY st.topic_order, st.id
          `
          const { rows: topics } = await pool.query(topicsQuery, [chap.id, class_id || 0])

          for (const topic of topics) {
            // Fetch resources
            const { rows: resources } = await pool.query(
              'SELECT * FROM school_resources WHERE school_topic_id = $1 ORDER BY id',
              [topic.id]
            )
            topic.resources = resources
          }

          // Fetch tasks
          const { rows: tasks } = await pool.query(
            'SELECT * FROM school_tasks WHERE school_chapter_id = $1 ORDER BY id',
            [chap.id]
          )

          chap.topics = topics
          chap.tasks = tasks
        }

        sub.chapters = chapters
      }
    }

    return NextResponse.json({ subjects })
  } catch (err) {
    console.error('School subjects GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch school subjects' }, { status: 500 })
  }
}
