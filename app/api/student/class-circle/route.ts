import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { getISTDateParts } from '@/lib/birthday'

// Feed of student birthday posts for the caller's own grade circle —
// TODAY only. A post is never shown again after the day it fired: it just
// stops matching post_date = today once the date rolls over, no cleanup
// job needed. class_circles is read only — never created here — a grade
// with no birthdays yet (or none today) simply has no matching rows, which
// is the normal/expected empty state, not an error.
export async function GET() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const studentRes = await pool.query(`SELECT school_id, grade FROM students WHERE id = $1`, [session.studentId])
    if (studentRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const { school_id, grade } = studentRes.rows[0]

    const circleRes = await pool.query(`SELECT id FROM class_circles WHERE school_id = $1 AND grade = $2`, [school_id, grade])
    if (circleRes.rows.length === 0) return NextResponse.json({ posts: [] })
    const circleId = circleRes.rows[0].id

    const { dateStr: todayStr } = getISTDateParts()

    const postsRes = await pool.query(
      `SELECT bp.id, bp.person_id, s.name AS person_name
       FROM birthday_posts bp
       JOIN students s ON s.id = bp.person_id
       WHERE bp.class_circle_id = $1 AND bp.person_type = 'student' AND bp.post_date = $2::date
       ORDER BY bp.id DESC`,
      [circleId, todayStr]
    )

    const postIds = postsRes.rows.map(p => p.id)
    const wishesByPost = new Map<number, { wisherName: string; wisherId: number; message: string; createdAt: string }[]>()
    if (postIds.length > 0) {
      const wishesRes = await pool.query(
        `SELECT bw.birthday_post_id, bw.wisher_id, bw.message, bw.created_at, s.name AS wisher_name
         FROM birthday_wishes bw
         JOIN students s ON s.id = bw.wisher_id AND bw.wisher_type = 'student'
         WHERE bw.birthday_post_id = ANY($1)
         ORDER BY bw.created_at ASC`,
        [postIds]
      )
      for (const w of wishesRes.rows) {
        const list = wishesByPost.get(w.birthday_post_id) ?? []
        list.push({ wisherName: w.wisher_name, wisherId: w.wisher_id, message: w.message, createdAt: w.created_at })
        wishesByPost.set(w.birthday_post_id, list)
      }
    }

    const posts = postsRes.rows.map(p => {
      const wishes = wishesByPost.get(p.id) ?? []
      return {
        id: p.id,
        personId: p.person_id,
        personName: p.person_name,
        isOwnPost: p.person_id === session.studentId,
        wishes: wishes.map(({ wisherName, message, createdAt }) => ({ wisherName, message, createdAt })),
        wishedByMe: wishes.some(w => w.wisherId === session.studentId),
      }
    })

    return NextResponse.json({ posts })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
