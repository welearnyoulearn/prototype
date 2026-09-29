import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAdminActor } from '@/lib/attendanceAuth'
import { calendarBase, checkCalendarRules, CALENDAR_TYPE_COLOR, type CalendarType } from '@/lib/calendarSchemas'

// PATCH  /api/school-calendar/[id]   school admin only — edit an entry of THEIR school
// DELETE /api/school-calendar/[id]   school admin only
//
// Every query is scoped by school_id from the session, so an id belonging to another school
// is simply "not found". (Before #153 the id alone was enough to change any school's entry.)

const COLUMNS = `id, title, event_date::text AS event_date, end_date::text AS end_date, event_type, color,
  description, all_day, audience, created_by_name, created_at, updated_at`

type Row = {
  id: number; title: string; event_date: string; end_date: string | null; event_type: CalendarType
  description: string | null; audience: 'everyone' | 'staff'
}

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Only the school admin can change the calendar.' }, { status: 403 })
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { rows: [current] } = await pool.query<Row>(
      `SELECT ${COLUMNS} FROM school_calendar WHERE id = $1 AND school_id = $2`, [id, admin.schoolId]
    )
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Merge the change over the stored entry, then validate the WHOLE result.
    const body = await req.json().catch(() => null)
    const merged = calendarBase.safeParse({
      title: current.title, event_type: current.event_type, event_date: current.event_date,
      end_date: current.end_date, audience: current.audience, description: current.description,
      ...(body && typeof body === 'object' ? body : {}),
    })
    if (!merged.success) return NextResponse.json({ error: merged.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const v = merged.data
    const ruleError = checkCalendarRules(v)
    if (ruleError) return NextResponse.json({ error: ruleError }, { status: 400 })

    const endDate = v.end_date && v.end_date !== v.event_date ? v.end_date : null
    const audience = v.event_type === 'holiday' ? 'everyone' : v.audience

    // Only nag about existing attendance when this edit newly makes those days holidays.
    const becameOrGrewHoliday = v.event_type === 'holiday' && (
      current.event_type !== 'holiday' || v.event_date !== current.event_date || endDate !== current.end_date)
    if (becameOrGrewHoliday && !v.acknowledge_existing_attendance) {
      const { rows: [n] } = await pool.query<{ sessions: number; days: number }>(
        `SELECT COUNT(*)::int AS sessions, COUNT(DISTINCT date)::int AS days
         FROM attendance_sessions WHERE school_id = $1 AND date BETWEEN $2::date AND $3::date`,
        [admin.schoolId, v.event_date, endDate ?? v.event_date]
      )
      if (n.sessions > 0) {
        return NextResponse.json({
          error: `${n.sessions} attendance session${n.sessions > 1 ? 's are' : ' is'} already marked on ${n.days} of these day${n.days > 1 ? 's' : ''}. They will be ignored in all reports while this holiday exists.`,
          code: 'ATTENDANCE_EXISTS', sessions: n.sessions, days: n.days,
        }, { status: 409 })
      }
    }

    const { rows: [row] } = await pool.query(
      `UPDATE school_calendar
       SET title = $3, event_date = $4, end_date = $5, event_type = $6, color = $7,
           description = $8, audience = $9, updated_at = NOW()
       WHERE id = $1 AND school_id = $2
       RETURNING ${COLUMNS}`,
      [id, admin.schoolId, v.title, v.event_date, endDate, v.event_type, CALENDAR_TYPE_COLOR[v.event_type],
       v.description || null, audience]
    )
    return NextResponse.json(row)
  } catch (err) {
    console.error('[school-calendar PATCH]', err)
    return NextResponse.json({ error: 'Failed to update the calendar entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Only the school admin can change the calendar.' }, { status: 403 })
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { rows: [gone] } = await pool.query<{ event_type: string; event_date: string; end_date: string | null }>(
      `DELETE FROM school_calendar WHERE id = $1 AND school_id = $2
       RETURNING event_type, event_date::text AS event_date, end_date::text AS end_date`,
      [id, admin.schoolId]
    )
    if (!gone) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Removing a holiday makes any attendance recorded on those days count again — say so.
    let restoredSessions = 0
    if (gone.event_type === 'holiday') {
      const { rows: [n] } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM attendance_sessions WHERE school_id = $1 AND date BETWEEN $2::date AND $3::date`,
        [admin.schoolId, gone.event_date, gone.end_date ?? gone.event_date]
      )
      restoredSessions = n.n
    }
    return NextResponse.json({ ok: true, restoredSessions })
  } catch (err) {
    console.error('[school-calendar DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete the calendar entry' }, { status: 500 })
  }
}
