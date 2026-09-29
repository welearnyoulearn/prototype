import { NextRequest, NextResponse } from 'next/server'
import { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { buildStudentAttendanceView } from '@/lib/attendanceStudentView'
import { isValidMonthStr } from '@/lib/attendanceRules'

// GET /api/student/attendance[?month=YYYY-MM]
//
// A student's own attendance — and nobody else's. The student id comes from the login, never
// from the request, so there is nothing to tamper with. (The student app used to download the
// whole class's month, with every classmate's name and record.)
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const student = await getStudentSession()
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const month = req.nextUrl.searchParams.get('month')
    if (month !== null && !isValidMonthStr(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

    const view = await buildStudentAttendanceView(student.schoolId, student.studentId, month)
    if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(view)
  } catch (err) {
    console.error('[student attendance]', err)
    return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 })
  }
}
