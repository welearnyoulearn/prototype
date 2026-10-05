import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'
import { formatISTDateTime } from '@/lib/istDate'
import { buildFeeAuditReport, type BulkReport } from '@/lib/feeAuditReport'
import { yearClassSql } from '@/lib/feeYearClass'
import { loadYearEndSettings, openStudentsList } from '@/lib/feeYearEnd'

// GET /api/fees/year-end/pack?school_id=X&academic_year=Y   (#343)
// One workbook with everything the school keeps from a year-end:
//   Summary (figures + live reconciliation + who closed it and why), Carried dues, Write-offs (with who
//   asked and who signed off), Passout moves, Left open (the open-dues register).
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id'), year = p.get('academic_year')
    if (!school_id || !year) return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await ensureDB()
    const sid = access.schoolId

    const report = await buildFeeAuditReport({ school_id: String(sid), academic_year: year, actor: access.actor }) as BulkReport
    const { settings } = await loadYearEndSettings(pool, sid)
    const { rows: [close] } = await pool.query(
      `SELECT closed_by, closed_at, is_reopened, close_reason, open_count, open_total FROM fee_year_close WHERE school_id = $1 AND academic_year = $2`, [sid, year])
    const { rows: [ownerRow] } = settings.owner_user_id
      ? await pool.query<{ name: string }>(`SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1`, [settings.owner_user_id])
      : { rows: [] as Array<{ name: string }> }
    const { rows: [approverRow] } = settings.approver_user_id
      ? await pool.query<{ name: string }>(`SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1`, [settings.approver_user_id])
      : { rows: [] as Array<{ name: string }> }

    // Carry-forward / write-off waivers raised by year-end for this year's bills, with each student's
    // class as it was that year.
    const yc = yearClassSql()
    const { rows: moves } = await pool.query(
      `SELECT w.waiver_type, w.waiver_amount, w.reason, w.granted_by_name, w.created_at,
              s.id AS student_id, s.name AS student_name, ${yc.grade} AS grade, COALESCE(${yc.section}, '') AS section
       FROM fee_waivers w
       JOIN student_fee_ledger l ON l.id = w.ledger_id
       JOIN students s ON s.id = l.student_id
       ${yc.join}
       WHERE l.school_id = $1 AND l.academic_year = $2 AND COALESCE(w.is_revoked, FALSE) = FALSE
         AND w.waiver_type IN ('carry_forward', 'writeoff')
       ORDER BY s.name, w.created_at`, [sid, year])

    type Agg = { student_id: number; name: string; cls: string; amount: number; note: string; by: string; at: string }
    const group = (rows: typeof moves, noteOf: (r: typeof moves[number]) => string): Agg[] => {
      const m = new Map<number, Agg>()
      for (const r of rows) {
        const a = m.get(r.student_id) ?? { student_id: r.student_id, name: r.student_name, cls: r.section ? `${r.grade}-${r.section}` : `Grade ${r.grade}`, amount: 0, note: noteOf(r), by: r.granted_by_name || '', at: r.created_at }
        a.amount += Number(r.waiver_amount)
        m.set(r.student_id, a)
      }
      return [...m.values()]
    }
    const isPassout = (r: typeof moves[number]) => r.waiver_type === 'carry_forward' && /^Moved to passout/i.test(r.reason || '')
    const carried = group(moves.filter(r => r.waiver_type === 'carry_forward' && !isPassout(r)), r => (r.reason || '').replace(/^Carried forward to /i, ''))
    const passout = group(moves.filter(isPassout), () => 'Moved to the passout ledger')
    const writeoffs = group(moves.filter(r => r.waiver_type === 'writeoff'), r => r.reason || '')
    const { rows: reqs } = await pool.query<{ student_id: number; requested_by: string | null; decided_by: string | null; decided_at: string | null }>(
      `SELECT DISTINCT ON (student_id) student_id, requested_by, decided_by, decided_at
       FROM fee_writeoff_requests WHERE school_id = $1 AND academic_year = $2 AND status IN ('approved', 'applied') ORDER BY student_id, id DESC`, [sid, year])
    const reqBy = new Map(reqs.map(r => [r.student_id, r]))

    // Everyone still owing from this year, from the live ledger — so years closed before the register
    // existed are covered too — with the register's owner / promise / note where one was recorded.
    const owing = await openStudentsList(pool, sid, year)
    const { rows: regRows } = await pool.query<{ student_id: number; owner_name: string | null; promised: string | null; deadline: string | null; note: string | null; amount_at_close: string; collected_by: string | null; collected_on: string | null }>(
      `SELECT student_id, owner_name, promised_date::text AS promised, deadline::text AS deadline, note, amount_at_close,
              (SELECT fp.collected_by_name FROM fee_payments fp JOIN student_fee_ledger pl ON pl.id = fp.ledger_id
                WHERE pl.school_id = od.school_id AND pl.academic_year = od.academic_year AND pl.student_id = od.student_id AND fp.payment_status = 'completed'
                ORDER BY fp.paid_date DESC, fp.id DESC LIMIT 1) AS collected_by,
              (SELECT fp.paid_date::text FROM fee_payments fp JOIN student_fee_ledger pl ON pl.id = fp.ledger_id
                WHERE pl.school_id = od.school_id AND pl.academic_year = od.academic_year AND pl.student_id = od.student_id AND fp.payment_status = 'completed'
                ORDER BY fp.paid_date DESC, fp.id DESC LIMIT 1) AS collected_on
       FROM fee_open_dues od WHERE od.school_id = $1 AND od.academic_year = $2`, [sid, year])
    const reg = new Map(regRows.map(r => [r.student_id, r]))
    const open = owing.map(o => {
      const r = reg.get(o.student_id)
      return { student_name: o.student_name, amount_at_close: r ? Number(r.amount_at_close) : '', balance_now: o.amount,
               owner_name: r?.owner_name ?? '', collected: r?.collected_on ? `${r.collected_on}${r.collected_by ? ` — ${r.collected_by}` : ''}` : '', promised: r?.promised ?? '', deadline: r?.deadline ?? '', note: r?.note ?? (r ? '' : 'Not in the open-dues register (year closed before it existed)') }
    })

    // ── workbook ──
    const wb = new ExcelJS.Workbook()
    wb.creator = 'WLYL'; wb.created = new Date()
    wb.calcProperties.fullCalcOnLoad = true
    const money = '#,##0.00'
    const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    const hdr = (ws: ExcelJS.Worksheet, labels: string[]) => {
      const r = ws.addRow(labels)
      r.eachCell(c => { c.fill = head; c.font = { color: { argb: 'FFFFFFFF' }, bold: true }; c.alignment = { horizontal: 'center' } })
      ws.views = [{ state: 'frozen', ySplit: r.number }]
      return r
    }
    const meta = (ws: ExcelJS.Worksheet, title: string) => {
      ws.addRow([title]).font = { size: 14, bold: true }
      ws.addRow([`School: ${report.meta.school_name}`]); ws.addRow([`Academic year: ${year}`])
      ws.addRow([`Generated by: ${access.actor}`]); ws.addRow([`Generated on: ${formatISTDateTime(new Date())}`]); ws.addRow([])
    }

    const s1 = wb.addWorksheet('Summary'); s1.columns = [{ width: 44 }, { width: 22 }, { width: 40 }]
    meta(s1, `YEAR-END PACK — ${year}`)
    const kv = (k: string, v: string | number, fmt?: string) => { const r = s1.addRow([k, v]); if (fmt && typeof v === 'number') r.getCell(2).numFmt = fmt; return r }
    s1.addRow(['PROCESS']).font = { bold: true }
    kv('Year-end owner', ownerRow?.name ?? 'not assigned')
    kv('Write-off approver', approverRow?.name ?? 'none (no sign-off step)')
    kv('Closed by', close && !close.is_reopened ? close.closed_by : 'not closed')
    kv('Closed on', close && !close.is_reopened && close.closed_at ? formatISTDateTime(close.closed_at) : '—')
    kv('Reason for closing with dues open', close?.close_reason || '—')
    s1.addRow([])
    s1.addRow(['FIGURES']).font = { bold: true }
    hdr(s1, ['Step', 'Amount'])
    const wbk = report.waiver_breakdown
    const rBilled = kv('Billed', report.summary.billed, money)
    kv('Less: discretionary waivers', -wbk.discretionary, money)
    kv('Less: carried forward to next year', -(carried.reduce((a, c) => a + c.amount, 0)), money)
    kv('Less: moved to passout ledger', -(passout.reduce((a, c) => a + c.amount, 0)), money)
    kv('Less: written off', -wbk.written_off, money)
    const rPaid = kv('Less: paid', -report.summary.paid, money)
    const calc = report.summary.billed - wbk.discretionary - wbk.carried_forward - wbk.written_off - report.summary.paid
    const rCalc = s1.addRow(['= Left open (calculated)', { formula: `SUM(B${rBilled.number}:B${rPaid.number})`, result: calc }]); rCalc.getCell(2).numFmt = money; rCalc.font = { bold: true }
    const rSys = kv('Left open per report', report.summary.balance, money)
    const rDiff = s1.addRow(['Difference (0 = reconciled)', { formula: `B${rCalc.number}-B${rSys.number}`, result: calc - report.summary.balance }]); rDiff.getCell(2).numFmt = money; rDiff.font = { bold: true }

    const sheet = (name: string, title: string, cols: string[], widths: number[], rows: Array<Array<string | number>>, moneyCols: number[], totalCol?: number) => {
      const ws = wb.addWorksheet(name); ws.columns = widths.map(w => ({ width: w }))
      meta(ws, title); hdr(ws, cols)
      if (rows.length === 0) ws.addRow(['None'])
      for (const r of rows) { const row = ws.addRow(r); moneyCols.forEach(c => { row.getCell(c).numFmt = money }) }
      if (rows.length > 0 && totalCol) {
        const t = ws.addRow(cols.map((_, i) => i === 0 ? 'TOTAL' : i + 1 === totalCol ? rows.reduce((a, r) => a + Number(r[i]), 0) : ''))
        t.font = { bold: true }; t.getCell(totalCol).numFmt = money
      }
    }
    sheet('Carried dues', `CARRIED TO THE NEXT YEAR — ${year}`, ['Student', 'Class (that year)', 'Amount carried', 'Carried to', 'Done by'], [28, 18, 18, 16, 36],
      carried.map(c => [c.name, c.cls, c.amount, c.note, c.by]), [3], 3)
    sheet('Write-offs', `WRITE-OFFS — ${year}`, ['Student', 'Class (that year)', 'Amount written off', 'Reason', 'Asked by', 'Approved by', 'Approved on', 'Applied by'], [28, 18, 18, 46, 34, 30, 22, 34],
      writeoffs.map(w => { const q = reqBy.get(w.student_id); return [w.name, w.cls, w.amount, w.note, q?.requested_by || '', q?.decided_by || (settings.approver_user_id ? 'no approval recorded' : 'no sign-off step'), q?.decided_at ? formatISTDateTime(q.decided_at) : '', w.by] }), [3], 3)
    sheet('Passout moves', `MOVED TO THE PASSOUT LEDGER — ${year}`, ['Student', 'Class (that year)', 'Amount moved', 'Done by'], [28, 18, 18, 36],
      passout.map(c => [c.name, c.cls, c.amount, c.by]), [3], 3)
    sheet('Left open', `LEFT OPEN AT CLOSE (open-dues register) — ${year}`, ['Student', 'Owed at close', 'Owes now', 'Owner', 'Last collected', 'Promised by', 'Deadline', 'Note'], [28, 16, 16, 30, 30, 14, 14, 44],
      open.map(o => [o.student_name, o.amount_at_close, o.balance_now, o.owner_name, o.collected, o.promised, o.deadline, o.note]), [2, 3], 3)

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="year_end_pack_${year}.xlsx"`,
      },
    })
  } catch (err: unknown) {
    console.error('[year-end/pack]', err)
    return NextResponse.json({ error: 'Failed to build the year-end pack' }, { status: 500 })
  }
}

export const GET = withWatchline(handleGET, { route: '/api/fees/year-end/pack' })
