import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'
import { buildStudentAttendanceView } from '@/lib/attendanceStudentView'
import { isValidMonthStr } from '@/lib/attendanceRules'

// GET /api/parent/attendance?student_id=Y[&month=YYYY-MM]
//
// A parent's view of ONE of their own children: month calendar, month and year-to-date
// percentages, six-month trend and upcoming holidays. The child must be linked to the logged-in
// parent — a student_id that is not theirs is answered exactly like one that does not exist.
// (Before #153 any logged-in user in the school could read any child's records.)
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = req.nextUrl.searchParams
    const studentId = Number(p.get('student_id'))
    if (!Number.isInteger(studentId) || studentId <= 0) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    const month = p.get('month')
    if (month !== null && !isValidMonthStr(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

    const { rowCount } = await pool.query(
      `SELECT 1 FROM student_parents sp JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 AND sp.student_id = $2 AND s.school_id = $3`,
      [parent.parentId, studentId, parent.schoolId]
    )
    if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const view = await buildStudentAttendanceView(parent.schoolId, studentId, month)
    if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(view)
  } catch (err) {
    console.error('[parent attendance]', err)
    return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 })
  }
}
