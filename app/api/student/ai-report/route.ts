import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { checkAuthRateLimit } from '@/lib/authRateLimit'

// POST /api/student/ai-report { source, content, reason, note?, chat_session_id? } — a student flags an
// AI-written answer (the AI tutor, or a "WLYL AI" quiz hint) as harmful, inappropriate or wrong (#552).
// Google Play's AI-generated content policy needs this flag inside the app. Identity and school come
// from the session; the reported text is stored as the student saw it, for review.
const body = z.object({
  source: z.enum(['tutor', 'doubt_ai']),
  content: z.string().trim().min(1).max(4000),
  reason: z.enum(['harmful', 'inappropriate', 'wrong', 'other']),
  note: z.string().trim().max(500).optional(),
  chat_session_id: z.number().int().positive().max(2147483647).optional(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    // 20 reports an hour per student is plenty for real use and keeps the table clean.
    if (!await checkAuthRateLimit(req, 'student-ai-report', String(session.studentId), { maxAttempts: 20, windowSeconds: 3600, blockSeconds: 3600 })) {
      return NextResponse.json({ error: 'Too many reports. Try again later.' }, { status: 429 })
    }
    const r = parsed.data
    await pool.query(
      `INSERT INTO ai_content_reports (school_id, student_id, source, chat_session_id, content, reason, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [session.schoolId, session.studentId, r.source, r.chat_session_id ?? null, r.content, r.reason, r.note || null],
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[student/ai-report]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
