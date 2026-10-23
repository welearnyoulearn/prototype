import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { MAX_STAFF_BATCH } from '@/lib/staffValidation'

// POST /api/teachers/parse-import — multipart form with a single .xlsx file.
// Parses server-side (ExcelJS is a large dependency, not worth bundling into
// the client just to read one uploaded file) and returns plain rows in the
// same column order as the controlled Excel template.
const HEADERS = [
  'name', 'email', 'subject', 'phone', 'department',
  'qualification', 'date_of_joining', 'staff_type', 'teaches_grades',
]
const DISPLAY_HEADERS = ['name', 'email', 'subject', 'phone', 'department', 'qualification', 'date of joining', 'staff type', 'teaches grades']
const MAX_EXCEL_BYTES = 5 * 1024 * 1024

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('text' in value && typeof value.text === 'string') return value.text.trim()
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('').trim()
    return ''
  }
  return String(value).trim()
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!admin.schoolId || !await schoolHasFeature(admin.schoolId, 'staff')) {
    return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED' }, { status: 403 })
  }
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_EXCEL_BYTES) {
      return NextResponse.json({ error: 'Excel file must be between 1 byte and 5 MB' }, { status: 413 })
    }
    const filename = typeof (file as File).name === 'string' ? (file as File).name.toLowerCase() : ''
    if (filename && !filename.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx Excel files are supported' }, { status: 415 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets.find(s => s.state === 'visible') ?? wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'No sheet found in the uploaded file' }, { status: 400 })

    const actualHeaders = DISPLAY_HEADERS.map((_, i) => cellText(ws.getRow(1).getCell(i + 1).value).toLowerCase().replace(/\s*\*$/, '').replace(/_/g, ' '))
    if (actualHeaders.some((value, i) => value !== DISPLAY_HEADERS[i])) {
      return NextResponse.json({ error: 'The Excel columns do not match the latest Staff Template. Download a fresh template and copy your rows into it.' }, { status: 422 })
    }

    const rows: Record<string, string>[] = []
    let populatedRows = 0
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // header row
      const values = row.values as ExcelJS.CellValue[] // 1-indexed, values[0] is empty
      const rendered = HEADERS.map((_, i) => cellText(values[i + 1]))
      if (rendered.every(value => !value) || rendered[0].startsWith('★')) return
      populatedRows += 1
      if (populatedRows > MAX_STAFF_BATCH) return

      const record: Record<string, string> = {}
      HEADERS.forEach((key, i) => {
        record[key] = rendered[i]
      })
      rows.push(record)
    })

    if (populatedRows > MAX_STAFF_BATCH) {
      return NextResponse.json({ error: `A maximum of ${MAX_STAFF_BATCH} staff rows can be imported at once` }, { status: 413 })
    }

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('teachers/parse-import error:', err)
    return NextResponse.json({ error: 'Failed to parse the uploaded file' }, { status: 500 })
  }
}
