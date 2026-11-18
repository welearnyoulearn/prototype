import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

// Expo push tokens for the teacher mobile app (wlyl-teacher-mobile) — the same contract as
// /api/parent/push/expo for the parent app. Auth is the same httpOnly
// teacher cookie every teacher route uses; school and teacher come from the session only. Tokens are
// kept in device_tokens with platform 'expo', so lib/push.ts's dispatcher pushes them with everything else.
// POST   { token } → remember this phone for the signed-in teacher
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
    const teacher = await getTeacherSession()
    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    // Upsert on token: a phone that signs in as another account moves to that teacher.
    await pool.query(
      `INSERT INTO device_tokens (school_id, recipient_role, recipient_id, token, platform)
       VALUES ($1, 'teacher', $2, $3, 'expo')
       ON CONFLICT (token) DO UPDATE
         SET school_id = EXCLUDED.school_id, recipient_role = 'teacher', recipient_id = EXCLUDED.recipient_id,
             platform = 'expo', last_seen_at = NOW()`,
      [teacher.schoolId, teacher.teacherId, token],
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[teacher/push/expo POST]', err)
    return NextResponse.json({ error: 'Failed to save push token' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDB()
    const teacher = await getTeacherSession()
    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    await pool.query(
      `DELETE FROM device_tokens WHERE token = $1 AND recipient_role = 'teacher' AND recipient_id = $2`,
      [token, teacher.teacherId],
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[teacher/push/expo DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete push token' }, { status: 500 })
  }
}
