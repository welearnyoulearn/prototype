import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'
import { parentOwnsStudent } from '@/lib/examsAuth'
import { positiveId } from '@/lib/quizBank'
import { dailyReport, reportDate } from '@/lib/parentDailyReport'
import { REPORT_MAX_DAYS_BACK } from '@/lib/parentDailyReportRules'

// GET /api/parent/daily-report?student_id=&date=YYYY-MM-DD — one day of the child's school life for the parent
// (#450): attendance, the Daily Quiz done or not, open doubts, topics taught. Date defaults to today (IST).
export async function GET(req: NextRequest) {
  await ensureDB()
  const p = await getParentSession()
  if (!p) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const studentId = positiveId(req.nextUrl.searchParams.get('student_id'))
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
  if (!await parentOwnsStudent(p.parentId, studentId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { rows: [s] } = await pool.query('SELECT 1 FROM students WHERE id = $1 AND school_id = $2', [studentId, p.schoolId])
  if (!s) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const now = new Date()
  const date = reportDate(req.nextUrl.searchParams.get('date'), now, REPORT_MAX_DAYS_BACK)
  if (!date) return NextResponse.json({ error: `date must be YYYY-MM-DD, within the last ${REPORT_MAX_DAYS_BACK} days` }, { status: 400 })
  try {
    return NextResponse.json(await dailyReport(studentId, p.schoolId, date, now), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[parent daily report]', err)
    return NextResponse.json({ error: 'Could not load the daily report. Please try again.' }, { status: 500 })
  }
}
