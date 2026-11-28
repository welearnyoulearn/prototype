import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'

// Expo push tokens for the student mobile app (wlyl-student-mobile, #552). Auth is the same httpOnly
// student cookie every /api/student/* route uses; school and student come from the session only. Tokens are
// kept in device_tokens with platform 'expo', so lib/push.ts's dispatcher pushes them with everything else.
// POST   { token } → remember this phone for the signed-in student
// DELETE { token } → forget this phone (only if it belongs to the caller)

const TokenBody = z.object({
  token: z.string().max(255).regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/),
})

async function readToken(req: NextRequest): Promise<string | null> {
  const parsed = TokenBody.safeParse(await req.json().catch(() => null))
  return parsed.success ? parsed.data.token : null
}

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const student = await getStudentSession()
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    // Upsert on token: a phone that signs in as another student moves to that student.
    await pool.query(
      `INSERT INTO device_tokens (school_id, recipient_role, recipient_id, token, platform)
       VALUES ($1, 'student', $2, $3, 'expo')
       ON CONFLICT (token) DO UPDATE
         SET school_id = EXCLUDED.school_id, recipient_role = 'student', recipient_id = EXCLUDED.recipient_id,
             platform = 'expo', last_seen_at = NOW()`,
      [student.schoolId, student.studentId, token],
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[student/push/expo POST]', err)
    return NextResponse.json({ error: 'Failed to save push token' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDB()
    const student = await getStudentSession()
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    await pool.query(
      `DELETE FROM device_tokens WHERE token = $1 AND recipient_role = 'student' AND recipient_id = $2`,
      [token, student.studentId],
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[student/push/expo DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete push token' }, { status: 500 })
  }
}
