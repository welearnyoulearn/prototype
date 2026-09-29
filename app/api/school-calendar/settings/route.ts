import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAdminActor } from '@/lib/attendanceAuth'
import { weeklyOffBody } from '@/lib/calendarSchemas'

// PUT /api/school-calendar/settings   { weekly_off_days: [0] }   school admin only
// Weekly-off weekdays (0 = Sunday … 6 = Saturday) are not working days: no attendance can be
// marked on them and they are left out of every percentage. The list is read via
// GET /api/school-calendar (`weeklyOff`).
export async function PUT(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Only the school admin can change the calendar.' }, { status: 403 })

    const parsed = weeklyOffBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const days = [...parsed.data.weekly_off_days].sort((a, b) => a - b)
    await pool.query(`UPDATE schools SET weekly_off_days = $2::smallint[] WHERE id = $1`, [admin.schoolId, days])
    return NextResponse.json({ weeklyOff: days })
  } catch (err) {
    console.error('[school-calendar settings PUT]', err)
    return NextResponse.json({ error: 'Failed to save the weekly-off days' }, { status: 500 })
  }
}
