import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getAdminActor, getStaffActor, actorDisplayName } from '@/lib/attendanceAuth'
import { getClassForSchool, getSessionLock } from '@/lib/attendance'
import { ATTENDANCE_SESSIONS, isValidDateStr } from '@/lib/attendanceRules'

// "Report a mistake" — the safe alternative to overwriting a colleague's locked attendance.
//
// POST  teacher: tell the admin a marked session looks wrong
// GET   admin:   the reports (?status=open|resolved|all, default open)
// PATCH admin:   resolve one   { id, resolution_note? }

const createBody = z.object({
  class_id: z.coerce.number().int().positive(),
  date: z.string().refine(isValidDateStr, 'date must be YYYY-MM-DD'),
  session: z.enum(ATTENDANCE_SESSIONS),
  note: z.string().trim().min(5, 'Please describe the mistake (at least 5 characters).').max(500),
})

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const actor = await getStaffActor()
    if (!actor || actor.kind !== 'teacher') return NextResponse.json({ error: 'Only teachers can report a mistake.' }, { status: 403 })

    const parsed = createBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const { class_id, date, session, note } = parsed.data

    const name = await actorDisplayName(actor)
    if (!name) return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 })
    if (!(await getClassForSchool(actor.schoolId, class_id))) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!(await getSessionLock(class_id, date, session))) {
      return NextResponse.json({ error: 'That session has not been marked, so there is nothing to report.' }, { status: 409 })
    }

    const { rowCount } = await pool.query(
      `INSERT INTO attendance_issue_reports
         (school_id, class_id, date, session, reported_by_teacher_id, reported_by_name, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (class_id, date, session, reported_by_teacher_id) WHERE status = 'open' DO NOTHING`,
      [actor.schoolId, class_id, date, session, actor.teacherId, name, note]
    )
    if (!rowCount) return NextResponse.json({ error: 'You have already reported this session. The admin has been notified.' }, { status: 409 })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[attendance report POST]', err)
    return NextResponse.json({ error: 'Failed to send the report' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const status = req.nextUrl.searchParams.get('status') ?? 'open'
    if (!['open', 'resolved', 'all'].includes(status)) return NextResponse.json({ error: 'status must be open, resolved or all' }, { status: 400 })

    const { rows } = await pool.query(
      `SELECT r.id, r.class_id, c.grade, c.section, r.date::text AS date, r.session, r.reported_by_name, r.note,
              r.status, r.created_at, r.resolved_by_name, r.resolved_at, r.resolution_note,
              k.marked_by_name AS marked_by
       FROM attendance_issue_reports r
       JOIN classes c ON c.id = r.class_id
       LEFT JOIN attendance_sessions k ON k.class_id = r.class_id AND k.date = r.date AND k.session = r.session
       WHERE r.school_id = $1 AND ($2 = 'all' OR r.status = $2)
       ORDER BY r.status, r.created_at DESC
       LIMIT 200`,
      [admin.schoolId, status]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[attendance report GET]', err)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}

const resolveBody = z.object({
  id: z.coerce.number().int().positive(),
  resolution_note: z.string().trim().max(500).optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = resolveBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const name = await actorDisplayName(admin)
    const { rowCount } = await pool.query(
      `UPDATE attendance_issue_reports
       SET status = 'resolved', resolved_by_name = $3, resolved_at = NOW(), resolution_note = $4
       WHERE id = $1 AND school_id = $2 AND status = 'open'`,
      [parsed.data.id, admin.schoolId, name ?? 'Admin', parsed.data.resolution_note ?? null]
    )
    if (!rowCount) return NextResponse.json({ error: 'Report not found or already resolved' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[attendance report PATCH]', err)
    return NextResponse.json({ error: 'Failed to resolve the report' }, { status: 500 })
  }
}
