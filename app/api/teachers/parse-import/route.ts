import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireSchoolAdmin } from '@/lib/auth'

// POST /api/teachers/parse-import — multipart form with a single .xlsx file.
// Parses server-side (ExcelJS is a large dependency, not worth bundling into
// the client just to read one uploaded file) and returns plain rows in the
// same column order as the CSV template, so StaffOnboarding.tsx can feed the
// result into the same TeacherRow table it already uses for CSV/manual rows.
const HEADERS = [
  'name', 'email', 'subject', 'phone', 'department',
  'qualification', 'date_of_joining', 'staff_type', 'teaches_grades',
]

export async function POST(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets.find(s => s.state === 'visible') ?? wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'No sheet found in the uploaded file' }, { status: 400 })

    const rows: Record<string, string>[] = []
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // header row
      const values = row.values as ExcelJS.CellValue[] // 1-indexed, values[0] is empty
      const first = values[1]
      if (first == null || String(first).trim() === '' || String(first).trim().startsWith('★')) return

      const record: Record<string, string> = {}
      HEADERS.forEach((key, i) => {
        const v = values[i + 1]
        record[key] = v == null ? '' : String(v).trim()
      })
      rows.push(record)
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('teachers/parse-import error:', err)
    return NextResponse.json({ error: 'Failed to parse the uploaded file' }, { status: 500 })
  }
}
