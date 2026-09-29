import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'

// One-click wish, always the server-side default message (see
// birthday_wishes.message's column default in lib/db.ts) — never
// client-supplied free text. Tenant/circle isolation: a student may only
// wish a post that belongs to their OWN grade's circle, verified by joining
// through class_circles rather than trusting anything from the client
// beyond the post id.
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { birthday_post_id } = await req.json()
    if (!Number.isInteger(birthday_post_id)) {
      return NextResponse.json({ error: 'Invalid post' }, { status: 400 })
    }

    const studentRes = await pool.query(`SELECT school_id, grade FROM students WHERE id = $1`, [session.studentId])
    if (studentRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const { school_id, grade } = studentRes.rows[0]

    const postRes = await pool.query(
      `SELECT bp.id, bp.person_id, cc.school_id, cc.grade
       FROM birthday_posts bp
       JOIN class_circles cc ON cc.id = bp.class_circle_id
       WHERE bp.id = $1 AND bp.person_type = 'student'`,
      [birthday_post_id]
    )
    if (postRes.rows.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    const post = postRes.rows[0]

    if (post.school_id !== school_id || post.grade !== grade) {
      return NextResponse.json({ error: 'This post is not in your Class Circle' }, { status: 403 })
    }
    if (post.person_id === session.studentId) {
      return NextResponse.json({ error: "You can't wish yourself!" }, { status: 400 })
    }

    const inserted = await pool.query(
      `INSERT INTO birthday_wishes (birthday_post_id, wisher_type, wisher_id, message)
       VALUES ($1, 'student', $2, DEFAULT)
       ON CONFLICT (birthday_post_id, wisher_type, wisher_id) DO NOTHING
       RETURNING id`,
      [birthday_post_id, session.studentId]
    )

    return NextResponse.json({ success: true, alreadyWished: inserted.rows.length === 0 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
