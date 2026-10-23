import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// POST /api/platform/topics
export async function POST(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const client = await pool.connect()
  try {
    const { id, chapter_id, topic_name, topic_order = 0, content_text = '', content_pdf_url = '', resources = [], questions = [] } = await req.json()
    if (!chapter_id || typeof topic_name !== 'string' || !topic_name.trim() || topic_name.trim().length > 300) {
      return NextResponse.json({ error: 'chapter_id and topic_name are required' }, { status: 400 })
    }
    if (!Number.isInteger(topic_order) || topic_order < 0 || topic_order > 10000) return NextResponse.json({ error: 'Invalid topic_order' }, { status: 400 })
    if (!Array.isArray(resources) || resources.length > 100 || !Array.isArray(questions) || questions.length > 500) {
      return NextResponse.json({ error: 'Too many or invalid resources/questions' }, { status: 400 })
    }

    await client.query('BEGIN')

    let topicId = id
    let topicRow

    if (id) {
      // Update
      const res = await client.query(
        `UPDATE master_topics
         SET topic_name = $1, topic_order = $2, content_text = $3, content_pdf_url = $4, questions = $5
         WHERE id = $6
         RETURNING *`,
        [topic_name.trim(), topic_order, content_text, content_pdf_url, JSON.stringify(questions), id]
      )
      topicRow = res.rows[0]
      if (!topicRow) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
      }
      const belongs = await client.query(`SELECT 1 FROM master_topics WHERE id = $1 AND chapter_id = $2`, [id, chapter_id])
      if (!belongs.rows.length) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Topic does not belong to chapter' }, { status: 400 })
      }
    } else {
      // Insert
      const res = await client.query(
        `INSERT INTO master_topics (chapter_id, topic_name, topic_order, content_text, content_pdf_url, questions)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [chapter_id, topic_name.trim(), topic_order, content_text, content_pdf_url, JSON.stringify(questions)]
      )
      topicRow = res.rows[0]
      topicId = topicRow.id
    }

    // Sync resources if provided
    if (resources && Array.isArray(resources)) {
      // For simplicity, delete old resources and insert new ones
      await client.query('DELETE FROM master_resources WHERE topic_id = $1', [topicId])
      for (const resItem of resources) {
        if (resItem.title && resItem.url && resItem.resource_type) {
          await client.query(
            `INSERT INTO master_resources (topic_id, resource_type, title, url)
             VALUES ($1, $2, $3, $4)`,
            [topicId, resItem.resource_type, resItem.title, resItem.url]
          )
        }
      }
    }

    // Fetch final resources to return
    const { rows: finalResources } = await client.query('SELECT * FROM master_resources WHERE topic_id = $1', [topicId])
    topicRow.resources = finalResources

    await client.query('COMMIT')
    return NextResponse.json({ topic: topicRow })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Platform topics POST error:', err)
    return NextResponse.json({ error: 'Failed to save master topic' }, { status: 500 })
  } finally {
    client.release()
  }
}

// DELETE /api/platform/topics?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await pool.query('DELETE FROM master_topics WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform topics DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master topic' }, { status: 500 })
  }
}
