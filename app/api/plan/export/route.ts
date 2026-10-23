import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { STAFF_ROLES } from '@/lib/staffAccounts'
import { formatISTDateTime } from '@/lib/istDate'

// GET /api/plan/export?dataset=students|parents|teachers|staff|classes|fees|attendance|marks|all
// The school's own data as an Excel workbook. This is what a school whose plan has ended can
// still do (proxy.ts exempts /api/plan/), so it must never depend on a plan feature. School
// administrator / principal only, always scoped to the caller's own school, and every export
// is written to the platform audit log. Password hashes, tokens and secrets are never included.

type Sheet = { name: string; sql: string }
const S = (name: string, sql: string): Sheet => ({ name, sql })

const DATASETS: Record<string, { label: string; sheets: Sheet[] }> = {
  students:   { label: 'Students',   sheets: [S('Students', `SELECT * FROM students WHERE school_id = $1 ORDER BY grade, section, name`)] },
  parents:    { label: 'Parents',    sheets: [S('Parents', `SELECT p.*, sp.student_id FROM parents p LEFT JOIN student_parents sp ON sp.parent_id = p.id WHERE p.school_id = $1 ORDER BY p.name`)] },
  teachers:   { label: 'Teachers',   sheets: [S('Teachers', `SELECT * FROM teachers WHERE school_id = $1 ORDER BY name`)] },
  staff:      { label: 'Staff accounts', sheets: [S('Staff accounts', `SELECT id, email, full_name, role, status, created_at FROM users WHERE school_id = $1 AND role = ANY($2) ORDER BY id`)] },
  classes:    { label: 'Classes',    sheets: [S('Classes', `SELECT * FROM classes WHERE school_id = $1 ORDER BY grade, section`)] },
  fees:       { label: 'Fees', sheets: [
    S('Fee ledger', `SELECT l.*, s.name AS student_name, s.grade, s.section FROM student_fee_ledger l JOIN students s ON s.id = l.student_id WHERE l.school_id = $1 ORDER BY l.academic_year, s.grade, s.section, s.name, l.id`),
    S('Fee payments', `SELECT p.*, s.name AS student_name, s.grade, s.section FROM fee_payments p JOIN students s ON s.id = p.student_id WHERE p.school_id = $1 ORDER BY p.paid_date, p.id`),
    S('Fee waivers', `SELECT w.*, s.name AS student_name FROM fee_waivers w JOIN students s ON s.id = w.student_id WHERE w.school_id = $1 ORDER BY w.id`),
  ] },
  attendance: { label: 'Attendance', sheets: [S('Attendance', `SELECT a.date, s.name AS student_name, s.grade, s.section, a.session, a.status FROM attendance a JOIN students s ON s.id = a.student_id WHERE a.school_id = $1 ORDER BY a.date, s.grade, s.section, s.name`)] },
  marks:      { label: 'Exams and marks', sheets: [
    S('Exams', `SELECT * FROM exam_records WHERE school_id = $1 ORDER BY id`),
    S('Marks', `SELECT m.*, s.name AS student_name, s.grade, s.section FROM exam_marks m JOIN students s ON s.id = m.student_id WHERE m.school_id = $1 ORDER BY m.exam_id, s.grade, s.section, s.name, m.subject_name`),
  ] },
}

const SENSITIVE = /password|hash|token|secret|salt/i

function cell(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') return JSON.stringify(v)
  return v as ExcelJS.CellValue
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.schoolId || !['school_admin', 'principal'].includes(session.role)) {
      return NextResponse.json({ error: 'Only the school administrator or principal can export school data' }, { status: 403 })
    }
    const schoolId = Number(session.schoolId)
    const key = req.nextUrl.searchParams.get('dataset') ?? ''
    const chosen = key === 'all' ? Object.values(DATASETS) : DATASETS[key] ? [DATASETS[key]] : null
    if (!chosen) return NextResponse.json({ error: 'Unknown dataset' }, { status: 400 })

    const { rows: [school] } = await pool.query<{ name: string }>(`SELECT name FROM schools WHERE id = $1`, [schoolId])
    const wb = new ExcelJS.Workbook()
    wb.creator = 'WLYL'
    wb.created = new Date()

    const counts: Record<string, number> = {}
    for (const ds of chosen) {
      for (const sheet of ds.sheets) {
        const params = sheet.sql.includes('$2') ? [schoolId, STAFF_ROLES] : [schoolId]
        const { rows, fields } = await pool.query(sheet.sql, params)
        const cols = fields.map(f => f.name).filter(n => !SENSITIVE.test(n))
        const ws = wb.addWorksheet(sheet.name.slice(0, 31))
        const header = ws.addRow(cols)
        header.font = { bold: true }
        ws.views = [{ state: 'frozen', ySplit: 1 }]
        for (const r of rows) ws.addRow(cols.map(c => cell(r[c])))
        cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(10, c.length + 2)) })
        counts[sheet.name] = rows.length
      }
    }

    // Who took which data out, and when — visible to the platform admin.
    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'school_data_export', 'school', $2, $3, $4)`,
      [session.userId, schoolId, school?.name ?? null, JSON.stringify({ dataset: key, rows: counts })]
    ).catch(err => console.error('[plan/export audit]', err))

    const buffer = await wb.xlsx.writeBuffer()
    const stamp = formatISTDateTime(new Date()).replace(/[^0-9A-Za-z]+/g, '-')
    const safeName = (school?.name ?? 'school').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}_${key}_${stamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[plan/export]', err)
    return NextResponse.json({ error: 'Export failed. Please try again.' }, { status: 500 })
  }
}
