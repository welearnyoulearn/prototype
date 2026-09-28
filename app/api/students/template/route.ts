import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'

const MANDATORY_COLS = new Set(['Last Name', 'First Name', 'Grade', 'Section', 'Parent Name', 'Parent Phone', 'Roll No'])

export async function GET() {
  const session = await requireSchoolAdmin()
  if (!session?.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!await schoolHasFeature(session.schoolId, 'students')) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 })
  }
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Students')

  const rawHeaders = [
    'Roll No', 'Last Name', 'First Name', 'Student Email', 'Grade', 'Section',
    'Parent Name', 'Parent Phone', 'Parent Email', 'Student Phone',
  ]
  const headers = rawHeaders.map(header => MANDATORY_COLS.has(header) ? `${header} *` : header)

  ws.columns = headers.map((header, index) => ({
    header,
    key: rawHeaders[index],
    width: rawHeaders[index] === 'Student Email' || rawHeaders[index] === 'Parent Email' ? 28 : rawHeaders[index] === 'Roll No' ? 12 : 16,
  }))

  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    const isMandatory = MANDATORY_COLS.has(String(cell.value).replace(/\s+\*$/, ''))
    cell.font = { bold: true, color: { argb: isMandatory ? 'FF7B2F00' : 'FF374151' } }
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isMandatory ? 'FFFEF3C7' : 'FFF3F4F6' },
    }
    cell.border = {
      bottom: { style: 'thin', color: { argb: isMandatory ? 'FFF59E0B' : 'FFD1D5DB' } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  headerRow.height = 22

  // Two example rows
  ws.addRow([1, 'Mehta', 'Arjun', 'arjun@student.com', '10', 'A', 'Suresh Mehta', '9876543210', 'suresh@parent.com', ''])
  ws.addRow([2, 'Patel', 'Priya', 'priya@student.com', '10', 'A', 'Ramesh Patel', '9876543211', 'ramesh@parent.com', ''])

  // Note row
  const noteRow = ws.addRow([])
  ws.mergeCells(`A${noteRow.number}:J${noteRow.number}`)
  const noteCell = ws.getCell(`A${noteRow.number}`)
  noteCell.value = '★ Columns marked * and highlighted yellow are MANDATORY. Roll No must be unique within the same Grade + Section.'
  noteCell.font = { italic: true, color: { argb: 'FFB45309' }, size: 9 }
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E6' } }
  noteCell.alignment = { horizontal: 'left', vertical: 'middle' }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="student_template.xlsx"',
    },
  })
}
