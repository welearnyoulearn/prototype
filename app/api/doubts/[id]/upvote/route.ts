import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// POST /api/doubts/[id]/upvote { school_id, student_id }
// Toggle upvote — adds if not upvoted, removes if already upvoted.
// Students cannot upvote their own doubts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const { id } = await params
  const body = await req.json()
  const { school_id, student_id } = body

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }

  const { rows: [doubt] } = await pool.query(
    'SELECT id, student_id, upvote_count FROM doubts WHERE id = $1 AND school_id = $2',
    [id, school_id]
  )
  if (!doubt) return NextResponse.json({ error: 'Doubt not found' }, { status: 404 })

  // Prevent self-upvote
  if (doubt.student_id === parseInt(student_id)) {
    return NextResponse.json({ error: 'Cannot upvote your own doubt' }, { status: 400 })
  }

  // Check if already upvoted
  const { rows: [existing] } = await pool.query(
    'SELECT id FROM doubt_upvotes WHERE doubt_id = $1 AND student_id = $2',
    [id, student_id]
  )

  let upvoted: boolean
  let newCount: number

  if (existing) {
    // Remove upvote
    await pool.query('DELETE FROM doubt_upvotes WHERE doubt_id = $1 AND student_id = $2', [id, student_id])
    const { rows: [updated] } = await pool.query(
      'UPDATE doubts SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = $1 RETURNING upvote_count',
      [id]
    )
    upvoted = false
    newCount = updated.upvote_count
  } else {
    // Add upvote
    await pool.query(
      'INSERT INTO doubt_upvotes (doubt_id, student_id, school_id) VALUES ($1, $2, $3)',
      [id, student_id, school_id]
    )
    const { rows: [updated] } = await pool.query(
      'UPDATE doubts SET upvote_count = upvote_count + 1 WHERE id = $1 RETURNING upvote_count',
      [id]
    )
    upvoted = true
    newCount = updated.upvote_count
  }

  return NextResponse.json({ upvoted, upvote_count: newCount })
}
