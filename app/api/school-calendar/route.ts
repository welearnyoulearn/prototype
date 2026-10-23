import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAttendanceActor, getAdminActor, actorDisplayName } from '@/lib/attendanceAuth'
import { getWeeklyOff } from '@/lib/attendance'
import { isValidDateStr, todayIST } from '@/lib/attendanceRules'
import { calendarBase, checkCalendarRules, CALENDAR_TYPE_COLOR } from '@/lib/calendarSchemas'

// The Academic Calendar (holidays, exams, events, meetings).
//
// GET   any signed-in member of the school (admin, teacher, student, parent) — READ ONLY.
//       Students and parents only see entries whose audience is "everyone".
// POST  school admin only. A holiday blocks attendance on its dates for the whole school.
//
// The school always comes from the session. (Before #153 these routes had no authentication
// at all: anyone could read, change or delete any school's calendar.)

const COLUMNS = `id, title, event_date::text AS event_date, end_date::text AS end_date, event_type, color,
  description, all_day, audience, created_by_name, created_at, updated_at`

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const actor = await getAttendanceActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = req.nextUrl.searchParams
    if (p.get('school_id') !== null && Number(p.get('school_id')) !== actor.schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const today = todayIST()
    let from: string, to: string
    if (p.get('from') || p.get('to')) {
      from = p.get('from') ?? ''; to = p.get('to') ?? ''
      if (!isValidDateStr(from) || !isValidDateStr(to) || to < from) {
        return NextResponse.json({ error: 'from and to must be valid dates (YYYY-MM-DD), from ≤ to' }, { status: 400 })
      }
    } else {
      const yearRaw = p.get('year') ?? today.slice(0, 4)
      if (!/^\d{4}$/.test(yearRaw)) return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 })
      from = `${yearRaw}-01-01`; to = `${yearRaw}-12-31`
    }

    const staff = actor.kind === 'admin' || actor.kind === 'teacher'
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM school_calendar
       WHERE school_id = $1
         AND event_date <= $3::date AND COALESCE(end_date, event_date) >= $2::date
         AND ($4::boolean OR audience = 'everyone')
       ORDER BY event_date, id`,
      [actor.schoolId, from, to, staff]
    )
    // Only the admin needs to see who created an entry.
    const events = actor.kind === 'admin' ? rows : rows.map(r => { const copy = { ...r }; delete copy.created_by_name; return copy })
    return NextResponse.json({ events, weeklyOff: await getWeeklyOff(actor.schoolId), today, canEdit: (await getAdminActor()) !== null })
  } catch (err) {
    console.error('[school-calendar GET]', err)
    return NextResponse.json({ error: 'Failed to load the calendar' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Only the school admin can change the calendar.' }, { status: 403 })

    const parsed = calendarBase.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const v = parsed.data
    const ruleError = checkCalendarRules(v)
    if (ruleError) return NextResponse.json({ error: ruleError }, { status: 400 })

    const endDate = v.end_date && v.end_date !== v.event_date ? v.end_date : null
    // A holiday is for everyone: teachers and parents must be able to see why there is no school.
    const audience = v.event_type === 'holiday' ? 'everyone' : v.audience

    if (v.event_type === 'holiday' && !v.acknowledge_existing_attendance) {
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

    const name = await actorDisplayName(admin)
    const { rows: [row] } = await pool.query(
      `INSERT INTO school_calendar
         (school_id, title, event_date, end_date, event_type, color, description, all_day, audience, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)
       RETURNING ${COLUMNS}`,
      [admin.schoolId, v.title, v.event_date, endDate, v.event_type, CALENDAR_TYPE_COLOR[v.event_type],
       v.description || null, audience, name]
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    console.error('[school-calendar POST]', err)
    return NextResponse.json({ error: 'Failed to save the calendar entry' }, { status: 500 })
  }
}

