import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// PATCH /api/platform/renewals/{id}  { status?: 'open'|'contacted'|'dismissed', note?: string }
// Working the queue: mark a request contacted, dismiss it, reopen it, or keep a note about the
// conversation. "renewed" is never set here — it happens when the plan is actually renewed
// (PUT /api/schools/{id}/subscription closes the school's waiting request and records what was agreed).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json().catch(() => ({})) as { status?: unknown; note?: unknown }
    if (body.status !== undefined && !['open', 'contacted', 'dismissed'].includes(body.status as string)) {
      return NextResponse.json({ error: 'status must be open, contacted or dismissed' }, { status: 400 })
    }
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000)) {
      return NextResponse.json({ error: 'note must be text up to 2000 characters' }, { status: 400 })
    }
    if (body.status === undefined && body.note === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { rows: [cur] } = await pool.query(`SELECT id, school_id, status FROM plan_renewal_requests WHERE id = $1`, [id])
    if (!cur) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (cur.status === 'renewed') return NextResponse.json({ error: 'This request is already renewed' }, { status: 409 })

    try {
      const { rows: [row] } = await pool.query(
        `UPDATE plan_renewal_requests
         SET status = COALESCE($2, status),
             note = COALESCE($3, note),
             handled_by_email = (SELECT email FROM users WHERE id = $4),
             handled_at = NOW()
         WHERE id = $1
         RETURNING id, status, note, handled_at`,
        [id, body.status ?? null, body.note ?? null, session.userId])
      return NextResponse.json(row)
    } catch (e) {
      // Reopening while the school already has another waiting request violates the one-per-school index.
      if ((e as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'This school already has another waiting request' }, { status: 409 })
      }
      throw e
    }
  } catch (err) {
    console.error('[platform/renewals PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
