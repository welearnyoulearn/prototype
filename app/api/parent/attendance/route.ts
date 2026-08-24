import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/parent/attendance?school_id=X&student_id=Y&months=3
export async function GET(req: NextRequest) {
  try {
    const authSession = await getAnySession()
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const p = req.nextUrl.searchParams
    const school_id  = p.get('school_id')
    const student_id = p.get('student_id')
    const months     = parseInt(p.get('months') || '3')
    if (!school_id || !student_id) return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })
    if (Number(school_id) !== Number(authSession.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const { rows: records } = await pool.query(
        `SELECT date, session, status
         FROM attendance
         WHERE school_id = $1 AND student_id = $2
           AND date >= CURRENT_DATE - INTERVAL '${months} months'
         ORDER BY date DESC, session`,
        [school_id, student_id]
      )

      // Aggregate by date
      const byDate: Record<string, { morning?: string; afternoon?: string }> = {}
      for (const r of records) {
        const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
        if (!byDate[d]) byDate[d] = {}
        byDate[d][r.session as 'morning' | 'afternoon'] = r.status
      }

      const days = Object.entries(byDate).map(([date, sessions]) => ({
        date,
        morning:   sessions.morning   || null,
        afternoon: sessions.afternoon || null,
        present: sessions.morning === 'present',
      }))

      const totalDays    = days.length
      const presentDays  = days.filter(d => d.present).length
      const absentDays   = days.filter(d => d.morning === 'absent').length
      const lateDays     = days.filter(d => d.morning === 'late').length
      const pct          = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null

      // Monthly breakdown
      const monthlyMap: Record<string, { present: number; absent: number; late: number; total: number }> = {}
      for (const d of days) {
        const month = d.date.slice(0, 7)
        if (!monthlyMap[month]) monthlyMap[month] = { present: 0, absent: 0, late: 0, total: 0 }
        monthlyMap[month].total++
        if (d.morning === 'present') monthlyMap[month].present++
        else if (d.morning === 'absent') monthlyMap[month].absent++
        else if (d.morning === 'late')   monthlyMap[month].late++
      }

      const monthly = Object.entries(monthlyMap)
        .map(([month, s]) => ({ month, ...s, pct: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 }))
        .sort((a, b) => b.month.localeCompare(a.month))

      return NextResponse.json({ days, monthly, summary: { totalDays, presentDays, absentDays, lateDays, pct } })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
