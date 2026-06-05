import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/platform/topics
export async function POST(req: NextRequest) {
  try {
    const { id, chapter_id, topic_name, topic_order = 0, content_text = '', content_pdf_url = '', resources = [], questions = [] } = await req.json()
    if (!chapter_id || !topic_name) {
      return NextResponse.json({ error: 'chapter_id and topic_name are required' }, { status: 400 })
    }

    let topicId = id
    let topicRow

    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_topics
         SET topic_name = $1, topic_order = $2, content_text = $3, content_pdf_url = $4, questions = $5
         WHERE id = $6
         RETURNING *`,
        [topic_name, topic_order, content_text, content_pdf_url, JSON.stringify(questions), id]
      )
      topicRow = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_topics (chapter_id, topic_name, topic_order, content_text, content_pdf_url, questions)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [chapter_id, topic_name, topic_order, content_text, content_pdf_url, JSON.stringify(questions)]
      )
      topicRow = res.rows[0]
      topicId = topicRow.id
    }

    // Sync resources if provided
    if (resources && Array.isArray(resources)) {
      // For simplicity, delete old resources and insert new ones
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

// DELETE /api/platform/topics?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    await pool.query('DELETE FROM master_topics WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform topics DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master topic' }, { status: 500 })
  }
}
