import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/syllabus?school_id=&class_id=&subject=
// Returns syllabus topics grouped by subject > chapter > topics with coverage stats.
export async function GET(req: NextRequest) {

  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const subject = req.nextUrl.searchParams.get('subject')

  if (!school_id || !class_id) {
    return NextResponse.json({ error: 'school_id and class_id required' }, { status: 400 })
  }

  try {
    let query = `
      SELECT st.*,
             t.name  AS covered_by_name,
             ht.name AS hod_remark_by_name
      FROM syllabus_topics st
      LEFT JOIN teachers t  ON t.id  = st.covered_by
      LEFT JOIN teachers ht ON ht.id = st.hod_remark_by
      WHERE st.school_id = $1 AND st.class_id = $2
    `
    const args: (string | number)[] = [school_id, class_id]

    if (subject) {
      query += ` AND st.subject = $3`
      args.push(subject)
    }

    query += ` ORDER BY st.subject, st.chapter_order, st.chapter_name, st.topic_order, st.topic_name`

    const { rows } = await pool.query(query, args)

    // Group by subject -> chapter -> topics
    const grouped: Record<string, {
      subject: string
      total: number
      covered: number
      chapters: Record<string, {
        chapter_name: string
        chapter_order: number
        total: number
        covered: number
        topics: typeof rows
      }>
    }> = {}

    for (const row of rows) {
      if (!grouped[row.subject]) {
        grouped[row.subject] = { subject: row.subject, total: 0, covered: 0, chapters: {} }
      }
      const subj = grouped[row.subject]
      subj.total++
      if (row.status === 'covered') subj.covered++

      if (!subj.chapters[row.chapter_name]) {
        subj.chapters[row.chapter_name] = {
          chapter_name: row.chapter_name,
          chapter_order: row.chapter_order,
          total: 0,
          covered: 0,
          topics: [],
        }
      }
      const ch = subj.chapters[row.chapter_name]
      ch.total++
      if (row.status === 'covered') ch.covered++
      ch.topics.push(row)
    }

    return NextResponse.json({
      subjects: Object.values(grouped).map(s => ({
        ...s,
        chapters: Object.values(s.chapters).sort((a, b) => a.chapter_order - b.chapter_order),
        completion_pct: s.total > 0 ? Math.round(100 * s.covered / s.total) : 0,
      }))
    })
  } catch (err) {
    console.error('Syllabus GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus' }, { status: 500 })
  }
}

// POST /api/syllabus — add topic(s)
// Body: { school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order }
// or body: { topics: [...] } for bulk
export async function POST(req: NextRequest) {

  const body = await req.json()

  try {
    // Support bulk insert
    const topics = body.topics ?? [body]

    if (!topics.length) return NextResponse.json({ error: 'No topics provided' }, { status: 400 })

    const inserted = []
    for (const t of topics) {
      const { school_id, class_id, subject, chapter_name, chapter_order = 0, topic_name, topic_order = 0 } = t
      if (!school_id || !class_id || !subject || !chapter_name || !topic_name) {
        return NextResponse.json({ error: 'school_id, class_id, subject, chapter_name, topic_name required' }, { status: 400 })
      }
      const { rows: [row] } = await pool.query(
        `INSERT INTO syllabus_topics (school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order]
      )
      inserted.push(row)
    }

    return NextResponse.json({ inserted })
  } catch (err: unknown) {
    console.error('Syllabus POST error:', err)
    // Unique constraint violation — duplicate topic
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'A topic with this name already exists in this chapter' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to add topics' }, { status: 500 })
  }
}
