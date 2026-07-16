import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/platform/subjects?board=&grade=&include_details=
export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get('board')
  const grade = req.nextUrl.searchParams.get('grade')
  const includeDetails = req.nextUrl.searchParams.get('include_details') === 'true'

  try {
    let query = 'SELECT * FROM master_subjects WHERE 1=1'
    const args: any[] = []

    if (board) {
      query += ' AND board = $' + (args.length + 1)
      args.push(board)
    }
    if (grade) {
      query += ' AND grade = $' + (args.length + 1)
      args.push(grade)
    }

    query += ' ORDER BY id'

    const { rows: subjects } = await pool.query(query, args)

    if (includeDetails) {
      // Recursively fetch chapters, topics, resources, and tasks
      for (const sub of subjects) {
        // Fetch chapters
        const { rows: chapters } = await pool.query(
          'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
          [sub.id]
        )

        for (const chap of chapters) {
          // Fetch topics
          const { rows: topics } = await pool.query(
            'SELECT * FROM master_topics WHERE chapter_id = $1 ORDER BY topic_order, id',
            [chap.id]
          )

          for (const topic of topics) {
            // Fetch resources
            const { rows: resources } = await pool.query(
              'SELECT * FROM master_resources WHERE topic_id = $1 ORDER BY id',
              [topic.id]
            )
            topic.resources = resources
          }

          // Fetch tasks
          const { rows: tasks } = await pool.query(
            'SELECT * FROM master_tasks WHERE chapter_id = $1 ORDER BY id',
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
    console.error('Platform subjects GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch master subjects' }, { status: 500 })
  }
}

// POST /api/platform/subjects
export async function POST(req: NextRequest) {
  try {
    const { board, grade, subject_name } = await req.json()
    if (!board || !grade || !subject_name) {
      return NextResponse.json({ error: 'board, grade, and subject_name are required' }, { status: 400 })
    }

    const { rows } = await pool.query(
      `INSERT INTO master_subjects (board, grade, subject_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (board, grade, subject_name) 
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [board, grade, subject_name]
    )

    return NextResponse.json({ subject: rows[0] })
  } catch (err) {
    console.error('Platform subjects POST error:', err)
    return NextResponse.json({ error: 'Failed to create master subject' }, { status: 500 })
  }
}

// DELETE /api/platform/subjects?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    await pool.query('DELETE FROM master_subjects WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform subjects DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master subject' }, { status: 500 })
  }
}
