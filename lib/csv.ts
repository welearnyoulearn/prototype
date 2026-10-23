// CSV output for fee exports that people open in Excel and check against the screens.
//  - UTF-8 BOM so Excel reads "₹" and non-English names correctly.
//  - Cells that start with = + - @ (or tab/CR) are prefixed with ' so a student name,
//    note or reason can't run as a spreadsheet formula.
//  - CRLF line endings, which Excel on Windows expects.

export const CSV_BOM = '﻿'

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/
const PHONE_LIKE = /^\+\d[\d\s-]*$/

export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s) && !PHONE_LIKE.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',')
}

export function toCSV(rows: Record<string, unknown>[], cols: { key: string; label: string }[]): string {
  return CSV_BOM + [csvRow(cols.map(c => c.label)), ...rows.map(r => csvRow(cols.map(c => r[c.key])))].join('\r\n') + '\r\n'
}

// For exports that need a few free-form lines above the table (e.g. the audit log).
export function toCSVLines(lines: unknown[][]): string {
  return CSV_BOM + lines.map(csvRow).join('\r\n') + '\r\n'
}
