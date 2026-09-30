import { NextRequest, NextResponse } from 'next/server'
import { recordHeartbeat } from '@/lib/usageTracking'
import { getSession, getPlatformSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'

// Pinged periodically by the client-side heartbeat hook in every portal shell while a usage
// session is active. The usage session id is a sequential integer, so it is only accepted
// from a signed-in caller and only updates a row that caller owns — otherwise anyone could
// keep other people's sessions "alive" and skew the usage figures.
// The staff session is read passively: this ping runs every minute and must not count as
// activity, or an abandoned tab would never hit the idle timeout.
export async function POST(req: NextRequest) {
  try {
    const actors: { role: string; id: number }[] = []
    const teacher = await getTeacherSession()
    if (teacher) actors.push({ role: 'teacher', id: teacher.teacherId })
    const student = await getStudentSession()
    if (student) actors.push({ role: 'student', id: student.studentId })
    const parent = await getParentSession()
    if (parent) actors.push({ role: 'parent', id: parent.parentId })
    const staff = await getSession({ passive: true })
    if (staff) actors.push({ role: staff.role, id: staff.userId })
    const platform = await getPlatformSession()
    if (platform?.role === 'platform_admin') actors.push({ role: 'platform_admin', id: platform.userId })
    if (actors.length === 0) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { usageSessionId } = await req.json().catch(() => ({ usageSessionId: null }))
    if (typeof usageSessionId === 'number') {
      await recordHeartbeat(usageSessionId, actors)
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
