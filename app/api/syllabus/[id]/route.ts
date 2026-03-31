import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// PATCH /api/syllabus/[id] — update status or topic details
// Body: { school_id, status, covered_by?, topic_name?, chapter_order?, topic_order? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id } = await params
  const body = await req.json()
  const { school_id, status, covered_by, topic_name, chapter_name, chapter_order, topic_order } = body

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const setClauses: string[] = []
    const args: (string | number | null)[] = []

    if (status !== undefined) {
      args.push(status)
      setClauses.push(`status = $${args.length}`)
      if (status === 'covered') {
        const today = new Date().toISOString().slice(0, 10)
        args.push(today)
        setClauses.push(`covered_date = $${args.length}`)
        if (covered_by) {
          args.push(covered_by)
          setClauses.push(`covered_by = $${args.length}`)
        }
      } else {
        setClauses.push(`covered_date = NULL`)
        setClauses.push(`covered_by = NULL`)
      }
    }

    if (topic_name !== undefined) { args.push(topic_name); setClauses.push(`topic_name = $${args.length}`) }
    if (chapter_name !== undefined) { args.push(chapter_name); setClauses.push(`chapter_name = $${args.length}`) }
    if (chapter_order !== undefined) { args.push(chapter_order); setClauses.push(`chapter_order = $${args.length}`) }
    if (topic_order !== undefined) { args.push(topic_order); setClauses.push(`topic_order = $${args.length}`) }

    if (!setClauses.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    args.push(id, school_id)
    const { rows: [updated] } = await pool.query(
      `UPDATE syllabus_topics SET ${setClauses.join(', ')}
       WHERE id = $${args.length - 1} AND school_id = $${args.length}
       RETURNING *`,
      args
    )

    if (!updated) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Syllabus PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 })
  }
}

// DELETE /api/syllabus/[id]?school_id=
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    await pool.query(
      'DELETE FROM syllabus_topics WHERE id = $1 AND school_id = $2',
      [id, school_id]
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Syllabus DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 })
  }
}
