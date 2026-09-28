import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin } from '@/lib/examsAuth'

const FIELDS = [
  'remind_7_day', 'remind_1_day', 'remind_exam_day',
  'notify_schedule_change', 'notify_cancelled', 'notify_marks_published',
] as const

// GET/PUT /api/exam-notification-settings?school_id= — admin's reminder
// toggles (spec section 11). One row per school, seeded with all-on defaults
// on first read/write so a school that's never touched this screen still
// gets a defined row rather than every consumer re-deriving its own default.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const school_id = req.nextUrl.searchParams.get('school_id')
    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [settings] } = await pool.query(
      `INSERT INTO exam_notification_settings (school_id) VALUES ($1)
       ON CONFLICT (school_id) DO UPDATE SET school_id = EXCLUDED.school_id
       RETURNING *`,
      [actor.schoolId]
    )
    return NextResponse.json(settings)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const actor = await requireExamsAdmin(body.school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const updates: string[] = []
    const vals: (boolean | number)[] = [actor.schoolId]
    for (const f of FIELDS) {
      if (typeof body[f] === 'boolean') {
        vals.push(body[f])
        updates.push(`${f} = $${vals.length}`)
      }
    }
    if (updates.length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

    const { rows: [settings] } = await pool.query(`
      INSERT INTO exam_notification_settings (school_id) VALUES ($1)
      ON CONFLICT (school_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
      RETURNING *
    `, vals)
    return NextResponse.json(settings)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
