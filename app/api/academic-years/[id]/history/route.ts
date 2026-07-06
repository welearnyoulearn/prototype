import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/academic-years/[id]/history?school_id=
// Returns the read-only edit history (snapshots) for an academic year — taken
// whenever its dates were changed while fee bills already existed for it.
// Purely informational: no live action (payments, edits) can be taken against
// the snapshot's ledger_snapshot — only the current academic_years row is live.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT id, academic_year_id, label,
              old_start_date::text, old_end_date::text,
              new_start_date::text, new_end_date::text,
              status_summary, changed_by, changed_at,
              jsonb_array_length(ledger_snapshot) AS bill_count
       FROM academic_year_snapshots
       WHERE academic_year_id = $1 AND school_id = $2
       ORDER BY changed_at DESC`,
      [id, school_id]
    )
    return NextResponse.json(rows)
  } catch (err: unknown) {
    console.error('[academic-years/history]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
