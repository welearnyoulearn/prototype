import ExcelJS from 'exceljs'
import type { Cell, ExportTable } from './types'

// A text cell starting with = + - @ (or a tab / carriage return) would be run as a formula when the file
// is opened in Excel. Numbers are left alone so negatives stay numbers.
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '""'
  const s = typeof v === 'string' ? safeText(v) : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function tableRowCount(tables: ExportTable[]): number {
  return tables.reduce((n, t) => n + t.rows.length, 0)
}

// One table → CSV. UTF-8 with BOM so Excel reads Telugu / Hindi names correctly.
export function renderCsv(table: ExportTable): string {
  const lines: string[] = []
  for (const t of table.title ?? []) lines.push(csvCell(t))
  lines.push(table.header.map(csvCell).join(','))
  for (const r of table.rows) lines.push(r.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n')
}

function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 28) || 'Sheet'
  let n = base, i = 2
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 25)} ${i++}`
  used.add(n.toLowerCase())
  base = n
  return base
}

// Tables → an .xlsx workbook: one sheet per table, bold shaded header, frozen header row, sensible widths.
export async function renderXlsx(tables: ExportTable[], meta: { schoolName: string; title: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = meta.schoolName
  wb.created = new Date()
  const used = new Set<string>()
  const list = tables.length ? tables : [{ name: 'Data', header: ['No data'], rows: [] } as ExportTable]
  for (const t of list) {
    const ws = wb.addWorksheet(sheetName(t.name, used))
    for (const line of t.title ?? []) {
      const r = ws.addRow([safeText(line)])
      r.font = { bold: true, size: 12 }
    }
    const headerRow = ws.addRow(t.header)
    headerRow.font = { bold: true, color: { argb: 'FF1F2937' } }
    headerRow.alignment = { vertical: 'middle' }
    headerRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FF818CF8' } } } })
    const headerIdx = headerRow.number
    for (const r of t.rows) ws.addRow(r.map(v => (typeof v === 'string' ? safeText(v) : v)))
    ws.views = [{ state: 'frozen', ySplit: headerIdx }]
    t.header.forEach((h, i) => {
      let max = h.length
      for (const r of t.rows.slice(0, 500)) {
        const v = r[i]
        const len = v === null || v === undefined ? 0 : String(v).length
        if (len > max) max = len
      }
      ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 8), 42)
    })
  }
  wb.title = meta.title
  return Buffer.from(await wb.xlsx.writeBuffer())
}
