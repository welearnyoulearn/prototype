import { NextRequest, NextResponse } from 'next/server'
import { getSession, getTeacherSession, getStudentSession, getParentSession, getPlatformSession } from '@/lib/auth'
import { recordFeatureOpen } from '@/lib/usageTracking'

const VALID_PORTALS = new Set(['school-admin', 'teacher', 'student', 'parent', 'platform-admin'])

// Fired from each portal's single navigateTo(key) function whenever a
// nav tab/module is opened. Identity comes from the request's own auth
// cookie (same as every other authenticated route), not from the client
// body — the client only says *what* was opened, never *who* opened it,
// so this can't be spoofed to attribute activity to another actor.
export async function POST(req: NextRequest) {
  try {
    const { portal, navKey } = await req.json()
    if (typeof navKey !== 'string' || !navKey || !VALID_PORTALS.has(portal)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    let actorId: number | null = null
    let actorRole: string | null = null
    let schoolId: number | null = null

    if (portal === 'teacher') {
      const s = await getTeacherSession()
      if (s) { actorId = s.teacherId; actorRole = 'teacher'; schoolId = s.schoolId }
    } else if (portal === 'student') {
      const s = await getStudentSession()
      if (s) { actorId = s.studentId; actorRole = 'student'; schoolId = s.schoolId }
    } else if (portal === 'parent') {
      const s = await getParentSession()
      if (s) { actorId = s.parentId; actorRole = 'parent'; schoolId = s.schoolId }
    } else if (portal === 'platform-admin') {
      const s = await getPlatformSession()
      if (s) { actorId = s.userId; actorRole = 'platform_admin'; schoolId = null }
    } else {
      const s = await getSession()
      if (s) { actorId = s.userId; actorRole = s.role; schoolId = s.schoolId ?? null }
    }

    if (actorId == null || actorRole == null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await recordFeatureOpen({ schoolId, actorId, actorRole, portal, navKey })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
