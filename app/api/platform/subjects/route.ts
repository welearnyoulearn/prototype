import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession, requirePlatformAdmin } from '@/lib/auth'

// GET /api/platform/subjects?board=&grade=&category=&include_details=
// Read-only master catalog shared across every school — not tenant-scoped
// data, so any authenticated portal session (platform-admin or school-admin)
// may read it, unlike the writes below which are platform-admin only.
export async function GET(req: NextRequest) {
  const platformSession = await requirePlatformAdmin()
  const anySession = platformSession ? null : await getAnySession()
  if (!platformSession && !anySession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const board = req.nextUrl.searchParams.get('board')
  const grade = req.nextUrl.searchParams.get('grade')
  const category = req.nextUrl.searchParams.get('category')
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
    if (category) {
      query += ' AND category = $' + (args.length + 1)
      args.push(category)
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
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { board, grade, subject_name: rawSubjectName, category } = await req.json()
    const subject_name = typeof rawSubjectName === 'string' ? rawSubjectName.trim() : rawSubjectName
    if (!board || !grade || !subject_name) {
      return NextResponse.json({ error: 'board, grade, and subject_name are required' }, { status: 400 })
    }

    // Whitespace/casing variants (e.g. "Science" vs "Science ") would each
    // satisfy the exact-string UNIQUE(board, grade, subject_name) constraint
    // as distinct rows — reuse an existing normalized match instead of
    // letting a repeated import silently create a near-duplicate subject.
    const existing = await pool.query(
      `SELECT * FROM master_subjects WHERE board = $1 AND grade = $2 AND LOWER(TRIM(subject_name)) = LOWER(TRIM($3))`,
      [board, grade, subject_name]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ subject: existing.rows[0] })
    }

    const { rows } = await pool.query(
      `INSERT INTO master_subjects (board, grade, subject_name, category)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (board, grade, subject_name)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [board, grade, subject_name, category === 'extra' ? 'extra' : 'academic']
    )

    return NextResponse.json({ subject: rows[0] })
  } catch (err) {
    console.error('Platform subjects POST error:', err)
    return NextResponse.json({ error: 'Failed to create master subject' }, { status: 500 })
  }
}

// DELETE /api/platform/subjects?id=
export async function DELETE(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
