import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// GET /api/platform/chapters/[id]/topics
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rows: topics } = await pool.query(
      'SELECT * FROM master_topics WHERE chapter_id = $1 ORDER BY topic_order, id',
      [id]
    )

    for (const topic of topics) {
      const { rows: resources } = await pool.query(
        'SELECT * FROM master_resources WHERE topic_id = $1 ORDER BY id',
        [topic.id]
      )
      topic.resources = resources
    }

    return NextResponse.json(topics)
  } catch (err) {
    console.error('Platform topics list GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 })
  }
}

// POST /api/platform/chapters/[id]/topics
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id, topic_name, topic_order = 0, content_text = '', content_pdf_url = '', resources = [], questions = [] } = await req.json()
    if (!topic_name) {
      return NextResponse.json({ error: 'topic_name is required' }, { status: 400 })
    }

    let topicId = id
    let topicRow

    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_topics
         SET topic_name = $1, topic_order = $2, content_text = $3, content_pdf_url = $4, questions = $5
         WHERE id = $6 AND chapter_id = $7
         RETURNING *`,
        [topic_name, topic_order, content_text, content_pdf_url, JSON.stringify(questions), id, chapterId]
      )
      topicRow = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_topics (chapter_id, topic_name, topic_order, content_text, content_pdf_url, questions)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [chapterId, topic_name, topic_order, content_text, content_pdf_url, JSON.stringify(questions)]
      )
      topicRow = res.rows[0]
      topicId = topicRow.id
    }

    // Sync resources if provided
    if (resources && Array.isArray(resources)) {
      await pool.query('DELETE FROM master_resources WHERE topic_id = $1', [topicId])
      for (const resItem of resources) {
        if (resItem.title && resItem.url && resItem.resource_type) {
          await pool.query(
            `INSERT INTO master_resources (topic_id, resource_type, title, url)
             VALUES ($1, $2, $3, $4)`,
            [topicId, resItem.resource_type, resItem.title, resItem.url]
          )
        }
      }
    }

    // Fetch final resources to return
    const { rows: finalResources } = await pool.query('SELECT * FROM master_resources WHERE topic_id = $1', [topicId])
    topicRow.resources = finalResources

    return NextResponse.json({ topic: topicRow })
  } catch (err) {
    console.error('Platform topics POST error:', err)
    return NextResponse.json({ error: 'Failed to save master topic' }, { status: 500 })
  }
}
