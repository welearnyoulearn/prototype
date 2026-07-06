import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/audit-log?school_id=X&academic_year=Y&limit=200
// Unifies every financial action into one chronological audit trail:
//   payments, waivers, waiver revocations, ledger amount edits,
//   structure amount changes, variable assignment changes, category config changes
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    const limit         = parseInt(p.get('limit') || '300')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    type AuditRow = { at: string; who: string; action: string; detail: string; amount: number | null }
    const rows: AuditRow[] = []

    async function tableExists(name: string): Promise<boolean> {
      const { rows: [r] } = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [name])
      return r.e
    }

    // 1. Payments (recorded + verified)
    try {
      const { rows: pmts } = await pool.query(
        `SELECT fp.created_at AS at, fp.amount, fp.payment_mode, fp.payment_status,
                fp.receipt_number, fp.collected_by_name, fp.verified_by, fp.verified_at,
                fp.rejection_reason,
                s.name AS student_name, fc.name AS fee_head, l.period_label
         FROM fee_payments fp
         JOIN students s ON s.id = fp.student_id
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE fp.school_id = $1 ${academic_year ? 'AND l.academic_year = $2' : ''}
         ORDER BY fp.created_at DESC LIMIT $${academic_year ? 3 : 2}`,
        academic_year ? [school_id, academic_year, limit] : [school_id, limit]
      )
      for (const pm of pmts) {
        if (pm.payment_status === 'completed') {
          rows.push({ at: pm.at, who: pm.collected_by_name || pm.verified_by || 'Admin',
            action: 'Payment recorded',
            detail: `${pm.student_name} · ${pm.fee_head} ${pm.period_label} · ${pm.receipt_number} · ${pm.payment_mode}`,
            amount: parseFloat(pm.amount) })
        } else if (pm.payment_status === 'rejected') {
          rows.push({ at: pm.verified_at || pm.at, who: pm.verified_by || 'Admin',
            action: 'Payment rejected',
            detail: `${pm.student_name} · ${pm.receipt_number} · ${pm.rejection_reason || ''}`,
            amount: parseFloat(pm.amount) })
        } else {
          rows.push({ at: pm.at, who: 'Parent (online)',
            action: 'Payment submitted',
            detail: `${pm.student_name} · ${pm.fee_head} ${pm.period_label} · awaiting verification`,
            amount: parseFloat(pm.amount) })
        }
      }
    } catch { /* skip */ }

    // 1b. Payment cancellations / corrections
    if (await tableExists('fee_payment_corrections')) {
      try {
        const { rows: corr } = await pool.query(
          `SELECT c.created_at AS at, c.action, c.old_amount, c.new_amount, c.old_mode, c.new_mode,
                  c.reason, c.done_by, c.new_receipt_number,
                  s.name AS student_name, fc.name AS fee_head, l.period_label
           FROM fee_payment_corrections c
           JOIN students s ON s.id = c.student_id
           JOIN student_fee_ledger l ON l.id = c.ledger_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE c.school_id = $1 ${academic_year ? 'AND l.academic_year = $2' : ''}
           ORDER BY c.created_at DESC LIMIT $${academic_year ? 3 : 2}`,
          academic_year ? [school_id, academic_year, limit] : [school_id, limit]
        )
        for (const c of corr) {
          if (c.action === 'correct') {
            rows.push({ at: c.at, who: c.done_by,
              action: 'Payment corrected',
              detail: `${c.student_name} · ${c.fee_head} ${c.period_label} · ₹${c.old_amount} → ₹${c.new_amount}${c.new_receipt_number ? ` · new ${c.new_receipt_number}` : ''} · ${c.reason}`,
              amount: parseFloat(c.new_amount) })
          } else {
            rows.push({ at: c.at, who: c.done_by,
              action: 'Payment cancelled',
              detail: `${c.student_name} · ${c.fee_head} ${c.period_label} · reversed ₹${c.old_amount} · ${c.reason}`,
              amount: parseFloat(c.old_amount) })
          }
        }
      } catch { /* skip */ }
    }

    // 2. Waivers (granted + revoked)
    try {
      const { rows: wvs } = await pool.query(
        `SELECT w.created_at AS at, w.waiver_amount, w.reason, w.granted_by_name,
                w.is_revoked, w.revoked_by, w.revoked_at, w.revoke_reason,
                s.name AS student_name, fc.name AS fee_head, l.period_label
         FROM fee_waivers w
         JOIN students s ON s.id = w.student_id
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE w.school_id = $1 ${academic_year ? 'AND l.academic_year = $2' : ''}
         ORDER BY w.created_at DESC LIMIT $${academic_year ? 3 : 2}`,
        academic_year ? [school_id, academic_year, limit] : [school_id, limit]
      )
      for (const w of wvs) {
        rows.push({ at: w.at, who: w.granted_by_name || 'Admin',
          action: 'Waiver granted',
          detail: `${w.student_name} · ${w.fee_head} ${w.period_label} · ${w.reason}`,
          amount: parseFloat(w.waiver_amount) })
        if (w.is_revoked) {
          rows.push({ at: w.revoked_at || w.at, who: w.revoked_by || 'Admin',
            action: 'Waiver revoked',
            detail: `${w.student_name} · ${w.fee_head} ${w.period_label} · ${w.revoke_reason || ''}`,
            amount: parseFloat(w.waiver_amount) })
        }
      }
    } catch { /* skip */ }

    // 3. Ledger amount edits
    if (await tableExists('student_fee_ledger_edits')) {
      try {
        const { rows: edits } = await pool.query(
          `SELECT e.changed_at AS at, e.old_amount, e.new_amount, e.reason, e.changed_by,
                  s.name AS student_name, fc.name AS fee_head, l.period_label
           FROM student_fee_ledger_edits e
           JOIN student_fee_ledger l ON l.id = e.ledger_id
           JOIN students s ON s.id = e.student_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE e.school_id = $1 ${academic_year ? 'AND l.academic_year = $2' : ''}
           ORDER BY e.changed_at DESC LIMIT $${academic_year ? 3 : 2}`,
          academic_year ? [school_id, academic_year, limit] : [school_id, limit]
        )
        for (const e of edits) {
          rows.push({ at: e.at, who: e.changed_by,
            action: 'Bill amount edited',
            detail: `${e.student_name} · ${e.fee_head} ${e.period_label} · ₹${e.old_amount} → ₹${e.new_amount} · ${e.reason}`,
            amount: parseFloat(e.new_amount) })
        }
      } catch { /* skip */ }
    }

    // 4. Structure amount changes
    if (await tableExists('fee_structure_history')) {
      try {
        const { rows: sh } = await pool.query(
          `SELECT h.changed_at AS at, h.grade, h.old_amount, h.new_amount, h.change_type, h.changed_by,
                  fc.name AS fee_head
           FROM fee_structure_history h
           JOIN fee_categories fc ON fc.id = h.fee_category_id
           WHERE h.school_id = $1 ${academic_year ? 'AND h.academic_year = $2' : ''}
           ORDER BY h.changed_at DESC LIMIT $${academic_year ? 3 : 2}`,
          academic_year ? [school_id, academic_year, limit] : [school_id, limit]
        )
        for (const h of sh) {
          rows.push({ at: h.at, who: h.changed_by,
            action: h.change_type === 'created' ? 'Fee amount set' : 'Fee amount changed',
            detail: `${h.fee_head} · Grade ${h.grade}${h.old_amount != null ? ` · ₹${h.old_amount} → ₹${h.new_amount}` : ` · ₹${h.new_amount}`}`,
            amount: parseFloat(h.new_amount) })
        }
      } catch { /* skip */ }
    }

    // 5. Variable assignment changes
    if (await tableExists('student_fee_assignment_history')) {
      try {
        const { rows: ah } = await pool.query(
          `SELECT h.changed_at AS at, h.old_amount, h.new_amount, h.change_type, h.changed_by,
                  s.name AS student_name, fc.name AS fee_head
           FROM student_fee_assignment_history h
           JOIN students s ON s.id = h.student_id
           JOIN fee_categories fc ON fc.id = h.fee_category_id
           WHERE h.school_id = $1 ${academic_year ? 'AND h.academic_year = $2' : ''}
           ORDER BY h.changed_at DESC LIMIT $${academic_year ? 3 : 2}`,
          academic_year ? [school_id, academic_year, limit] : [school_id, limit]
        )
        for (const h of ah) {
          rows.push({ at: h.at, who: h.changed_by,
            action: `Variable fee ${h.change_type}`,
            detail: `${h.student_name} · ${h.fee_head}${h.old_amount != null ? ` · ₹${h.old_amount} → ₹${h.new_amount}` : ` · ₹${h.new_amount}`}`,
            amount: parseFloat(h.new_amount) })
        }
      } catch { /* skip */ }
    }

    // 6. Category config changes
    if (await tableExists('fee_category_changelog')) {
      try {
        const { rows: cl } = await pool.query(
          `SELECT cl.changed_at AS at, cl.field_changed, cl.old_value, cl.new_value, cl.changed_by,
                  fc.name AS fee_head
           FROM fee_category_changelog cl
           JOIN fee_categories fc ON fc.id = cl.category_id
           WHERE cl.school_id = $1
           ORDER BY cl.changed_at DESC LIMIT $2`,
          [school_id, limit]
        )
        for (const c of cl) {
          rows.push({ at: c.at, who: c.changed_by,
            action: 'Category config changed',
            detail: `${c.fee_head} · ${c.field_changed}: ${c.old_value} → ${c.new_value}`,
            amount: null })
        }
      } catch { /* skip */ }
    }

    // 7. Year closures / rollovers — the most consequential financial-state-changing
    // operations (promotes every student, locks a year's books, bulk-creates carry-
    // forward bills), previously only inferable indirectly from a cluster of waiver
    // entries with a 'Carried forward to...' reason and no top-level record of their own.
    if (await tableExists('fee_year_close')) {
      try {
        const { rows: closures } = await pool.query(
          `SELECT academic_year, closed_by, closed_at, carried_count, carried_total,
                  writeoff_count, writeoff_total, is_reopened, reopened_by, reopened_at, reopen_reason
           FROM fee_year_close
           WHERE school_id = $1 ${academic_year ? 'AND academic_year = $2' : ''}
           ORDER BY closed_at DESC LIMIT $${academic_year ? 3 : 2}`,
          academic_year ? [school_id, academic_year, limit] : [school_id, limit]
        )
        for (const c of closures) {
          rows.push({ at: c.closed_at, who: c.closed_by,
            action: 'Academic year closed',
            detail: `${c.academic_year} · ${c.carried_count} bill(s) carried forward (₹${c.carried_total})${Number(c.writeoff_count) > 0 ? ` · ${c.writeoff_count} written off (₹${c.writeoff_total})` : ''}`,
            amount: parseFloat(c.carried_total) })
          if (c.is_reopened) {
            rows.push({ at: c.reopened_at || c.closed_at, who: c.reopened_by || 'Admin',
              action: 'Academic year reopened',
              detail: `${c.academic_year}${c.reopen_reason ? ` · ${c.reopen_reason}` : ''}`,
              amount: null })
          }
        }
      } catch { /* skip */ }
    }

    // Sort all by time desc, cap at limit
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    const capped = rows.slice(0, limit)

    // CSV export with an auditable metadata header row
    if (p.get('format') === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const generatedBy = p.get('generated_by') || 'Admin'

      // Fetch school name for the header
      let schoolName = `School #${school_id}`
      try {
        const { rows: [sc] } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [school_id])
        if (sc?.name) schoolName = sc.name
      } catch { /* fallback */ }

      // Row 1 — metadata that makes the document auditable
      const meta = [
        esc('FEE AUDIT LOG'),
        esc(`School: ${schoolName}`),
        esc(`Academic Year: ${academic_year || 'All'}`),
        esc(`Generated By: ${generatedBy}`),
        esc(`Generated On: ${new Date().toLocaleString('en-IN')}`),
        esc(`Total Records: ${capped.length}`),
      ].join(',')

      // Row 2 — column headers
      const header = ['Date/Time', 'Performed By', 'Action', 'Details (Before → After)', 'Amount (₹)'].map(esc).join(',')

      // Data rows
      const dataRows = capped.map(r => [
        esc(new Date(r.at).toLocaleString('en-IN')),
        esc(r.who),
        esc(r.action),
        esc(r.detail),
        esc(r.amount != null ? r.amount : ''),
      ].join(','))

      const csv = [meta, '', header, ...dataRows].join('\n')
      const filename = `fee_audit_${academic_year || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json(capped)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
