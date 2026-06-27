import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

const MANDATORY_COLS = new Set(['Last Name', 'First Name', 'Grade', 'Parent Name', 'Parent Phone', 'Roll No'])

export async function GET() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Students')

  const headers = [
    'Roll No', 'Last Name', 'First Name', 'Student Email', 'Grade', 'Section',
    'Parent Name', 'Parent Phone', 'Parent Email', 'Student Phone',
  ]

  ws.columns = headers.map(h => ({ header: h, key: h, width: h === 'Student Email' || h === 'Parent Email' ? 28 : h === 'Roll No' ? 10 : 16 }))

  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    const isMandatory = MANDATORY_COLS.has(cell.value as string)
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
  noteCell.value = '★ Yellow columns are MANDATORY. Roll No must be unique within the same Grade + Section.'
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
