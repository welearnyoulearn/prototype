import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/platform/subjects/[id]/full
//
// Returns every chapter for a subject with its topics (each carrying its own
// resources) and tasks already nested — in 4 queries total, batched with
// `WHERE ... = ANY($1)`, instead of the 1 + 2*chapters sequential round-trips
// the platform-admin curriculum page used to make (one topics + one tasks
// fetch per chapter). Read-only, so no auth guard — matches the existing
// per-resource routes this replaces.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rows: chapters } = await pool.query(
      'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
      [id]
    )
    if (chapters.length === 0) return NextResponse.json([])

    const chapterIds = chapters.map(c => c.id)
    const [{ rows: topics }, { rows: tasks }] = await Promise.all([
      pool.query('SELECT * FROM master_topics WHERE chapter_id = ANY($1::int[]) ORDER BY topic_order, id', [chapterIds]),
      pool.query('SELECT * FROM master_tasks WHERE chapter_id = ANY($1::int[]) ORDER BY id', [chapterIds]),
    ])

    const topicIds = topics.map(t => t.id)
    const { rows: resources } = topicIds.length
      ? await pool.query('SELECT * FROM master_resources WHERE topic_id = ANY($1::int[]) ORDER BY id', [topicIds])
      : { rows: [] }

    const resourcesByTopic = new Map<number, typeof resources>()
    for (const r of resources) {
      const list = resourcesByTopic.get(r.topic_id) ?? []
      list.push(r)
      resourcesByTopic.set(r.topic_id, list)
    }

    const topicsByChapter = new Map<number, (typeof topics[number] & { resources: typeof resources })[]>()
    for (const t of topics) {
      const list = topicsByChapter.get(t.chapter_id) ?? []
      list.push({ ...t, resources: resourcesByTopic.get(t.id) ?? [] })
      topicsByChapter.set(t.chapter_id, list)
    }

    const tasksByChapter = new Map<number, typeof tasks>()
    for (const tk of tasks) {
      const list = tasksByChapter.get(tk.chapter_id) ?? []
      list.push(tk)
      tasksByChapter.set(tk.chapter_id, list)
    }

    const full = chapters.map(c => ({
      ...c,
      topics: topicsByChapter.get(c.id) ?? [],
      tasks: tasksByChapter.get(c.id) ?? [],
    }))

    return NextResponse.json(full)
  } catch (err) {
    console.error('Platform subject full-details GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch subject details' }, { status: 500 })
  }
}
