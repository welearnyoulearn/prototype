import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

function toCSV(rows: Record<string, unknown>[], cols: { key: string; label: string }[]): string {
  const header = cols.map(c => `"${c.label}"`).join(',')
  const body = rows.map(r =>
    cols.map(c => {
      const v = r[c.key] ?? ''
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(',')
  ).join('\n')
  return header + '\n' + body
}

// GET /api/academic-years/[id]/snapshot-export?school_id=&snapshot_id=&type=ledger|defaulters
// Exports the pre-edit ledger state captured in a snapshot, tagged with the old
// date range it reflects. Only ledger/defaulters are offered — payments, day-
// collection and audit-log are immutable transaction logs unaffected by date
// edits, so the existing live exports (/api/fees/export, /api/fees/audit-log)
// already cover those correctly for any point in time.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const snapshot_id  = p.get('snapshot_id')
    const type         = p.get('type') || 'ledger'

    if (!school_id || !snapshot_id) {
      return NextResponse.json({ error: 'school_id and snapshot_id required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [snap] } = await pool.query(
      `SELECT label, old_start_date::text, old_end_date::text, ledger_snapshot
       FROM academic_year_snapshots
       WHERE id = $1 AND academic_year_id = $2 AND school_id = $3`,
      [snapshot_id, id, school_id]
    )
    if (!snap) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

    const allRows: Record<string, unknown>[] = snap.ledger_snapshot
    const rows = type === 'defaulters' ? allRows.filter(r => Number(r.balance) > 0) : allRows

    const cols = [
      { key: 'student_name',  label: 'Student Name' },
      { key: 'roll_number',   label: 'Roll Number' },
      { key: 'grade',         label: 'Grade' },
      { key: 'section',       label: 'Section' },
      { key: 'category_name', label: 'Fee Category' },
      { key: 'period_label',  label: 'Period' },
      { key: 'amount_due',    label: 'Amount Due (₹)' },
      { key: 'amount_paid',   label: 'Amount Paid (₹)' },
      { key: 'waiver_amount', label: 'Waiver (₹)' },
      { key: 'balance',       label: 'Balance (₹)' },
      { key: 'due_date',      label: 'Due Date' },
      { key: 'status',        label: 'Status (as of snapshot)' },
    ]

    const csv = toCSV(rows, cols)
    const asOf = `${snap.old_start_date}_to_${snap.old_end_date}`
    const filename = type === 'defaulters'
      ? `defaulters_${snap.label}_as-of_${asOf}.csv`
      : `ledger_${snap.label}_as-of_${asOf}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: unknown) {
    console.error('[academic-years/snapshot-export]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
