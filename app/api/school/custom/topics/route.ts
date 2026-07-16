import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/school/custom/topics
export async function POST(req: NextRequest) {
  try {
    const { id, school_chapter_id, topic_name, topic_order = 0, content_text = '', content_pdf_url = '', resources = [] } = await req.json()

    if (id) {
      // Edit topic
      const topicCheck = await pool.query('SELECT is_custom FROM school_topics WHERE id = $1', [id])
      if (topicCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
      }
      // Allow editing of both custom and global board-mandated topics (relaxation for school admins)

      const res = await pool.query(
        `UPDATE school_topics
         SET topic_name = $1, topic_order = $2, content_text = $3, content_pdf_url = $4
         WHERE id = $5
         RETURNING *`,
        [topic_name, topic_order, content_text, content_pdf_url, id]
      )
      const topicRow = res.rows[0]

      // Sync resources if supplied
      if (resources && Array.isArray(resources)) {
        await pool.query('DELETE FROM school_resources WHERE school_topic_id = $1', [id])
        for (const resItem of resources) {
          if (resItem.title && resItem.url && resItem.resource_type) {
            await pool.query(
              `INSERT INTO school_resources (school_topic_id, resource_type, title, url, is_custom)
               VALUES ($1, $2, $3, $4, TRUE)`,
              [id, resItem.resource_type, resItem.title, resItem.url]
            )
          }
        }
      }

      const { rows: finalResources } = await pool.query('SELECT * FROM school_resources WHERE school_topic_id = $1', [id])
      topicRow.resources = finalResources

      return NextResponse.json({ topic: topicRow })
    } else {
      // Create new topic
      if (!school_chapter_id || !topic_name) {
        return NextResponse.json({ error: 'school_chapter_id and topic_name are required' }, { status: 400 })
      }

      const res = await pool.query(
        `INSERT INTO school_topics (school_chapter_id, topic_name, topic_order, content_text, content_pdf_url, is_custom)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING *`,
        [school_chapter_id, topic_name, topic_order, content_text, content_pdf_url]
      )
      const topicRow = res.rows[0]
      const topicId = topicRow.id

      // Sync resources if supplied
      if (resources && Array.isArray(resources)) {
        for (const resItem of resources) {
          if (resItem.title && resItem.url && resItem.resource_type) {
            await pool.query(
              `INSERT INTO school_resources (school_topic_id, resource_type, title, url, is_custom)
               VALUES ($1, $2, $3, $4, TRUE)`,
              [topicId, resItem.resource_type, resItem.title, resItem.url]
            )
          }
        }
      }

      const { rows: finalResources } = await pool.query('SELECT * FROM school_resources WHERE school_topic_id = $1', [topicId])
      topicRow.resources = finalResources

      return NextResponse.json({ topic: topicRow })
    }
  } catch (err) {
    console.error('Custom topics POST error:', err)
    return NextResponse.json({ error: 'Failed to save topic' }, { status: 500 })
  }
}

// DELETE /api/school/custom/topics?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    const check = await pool.query('SELECT is_custom FROM school_topics WHERE id = $1', [id])
    if (check.rowCount === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    if (!check.rows[0].is_custom) {
      return NextResponse.json({ error: 'Cannot delete global board-mandated topics' }, { status: 403 })
    }

    await pool.query('DELETE FROM school_topics WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Custom topics DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 })
  }
}
