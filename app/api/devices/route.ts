import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'

// Push-notification device registration. The web app and the parent app both call this after login
// with their FCM registration token. The owner always comes from the session, never from the body.

type DeviceOwner = { role: 'teacher' | 'student' | 'parent' | 'school'; id: number; schoolId: number }

// Same precedence as /api/notifications and getAnySession(): teacher, student, parent, school staff.
// A school-staff device is keyed by school id because school-level notifications go to every admin.
async function deviceOwner(): Promise<DeviceOwner | null> {
  const teacher = await getTeacherSession()
  if (teacher) return { role: 'teacher', id: teacher.teacherId, schoolId: teacher.schoolId }
  const student = await getStudentSession()
  if (student) return { role: 'student', id: student.studentId, schoolId: student.schoolId }
  const parent = await getParentSession()
  if (parent) return { role: 'parent', id: parent.parentId, schoolId: parent.schoolId }
  const admin = await getSession({ passive: true })
  if (admin?.schoolId) return { role: 'school', id: admin.schoolId, schoolId: admin.schoolId }
  return null
}

const registerBody = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(['web', 'android', 'ios']),
})

const removeBody = z.object({
  token: z.string().trim().min(20).max(4096),
})

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const owner = await deviceOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = registerBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const { token, platform } = parsed.data

    // A device that signs in as someone else is re-pointed at the new owner.
    await pool.query(
      `INSERT INTO device_tokens (school_id, recipient_role, recipient_id, token, platform)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token) DO UPDATE
         SET school_id = EXCLUDED.school_id, recipient_role = EXCLUDED.recipient_role,
             recipient_id = EXCLUDED.recipient_id, platform = EXCLUDED.platform, last_seen_at = NOW()`,
      [owner.schoolId, owner.role, owner.id, token, platform]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API devices POST]', error)
    return NextResponse.json({ error: 'Failed to register device' }, { status: 500 })
  }
}

// Called on logout so the next person on a shared device does not receive the previous user's pushes.
// Only removes a token that belongs to the caller.
export async function DELETE(req: NextRequest) {
  try {
    await ensureDB()
    const owner = await deviceOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = removeBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    await pool.query(
      `DELETE FROM device_tokens WHERE token = $1 AND recipient_role = $2 AND recipient_id = $3`,
      [parsed.data.token, owner.role, owner.id]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API devices DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove device' }, { status: 500 })
  }
}
