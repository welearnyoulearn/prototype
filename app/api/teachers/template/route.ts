import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { getStaffSubjectOptions } from '@/lib/staffSubjectOptions'

const MANDATORY_COLS = new Set(['Name', 'Email', 'Subject', 'Phone'])

// GET /api/teachers/template?school_id=X
// Excel is intentional here: its in-cell dropdowns keep subjects, staff types
// and grades aligned with the values the product understands.
// the Subject column gets a real in-cell dropdown — all master subjects plus
// custom subjects owned by this school, so a filled-in Excel import cannot
// introduce a spelling variant that silently fails to match
// school_subjects.subject_name the way free-typed CSV text can. If the
// school hasn't subscribed to anything (no Syllabus feature, or feature
// present but unused), fall back to the full platform master catalog —
// still a clean typo-proof list, just not narrowed to this school yet.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  const schoolId = Number(school_id)
  if (!Number.isInteger(schoolId) || schoolId <= 0) return NextResponse.json({ error: 'Invalid school_id' }, { status: 400 })
  if (!await requireFeeAccess(schoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await schoolHasFeature(schoolId, 'staff'))) {
    return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED' }, { status: 403 })
  }

  const subjectOptions = await getStaffSubjectOptions(schoolId)
  const subjectNames = subjectOptions.map(option => option.name)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Staff')

  const headers = [
    'Name *', 'Email *', 'Subject *', 'Phone *', 'Department',
    'Qualification', 'Date of Joining', 'Staff Type', 'Teaches Grades',
  ]
  ws.columns = headers.map(h => ({
    header: h, key: h,
    width: h.startsWith('Email') ? 26 : h === 'Department' || h === 'Qualification' ? 18 : 16,
  }))

  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    const isMandatory = MANDATORY_COLS.has(String(cell.value).replace(/\s*\*$/, ''))
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
  ws.addRow(['Priya Sharma', 'priya@school.com', subjectNames[0] ?? 'Mathematics', '9876543210', 'Science', 'B.Ed', '2023-06-01', 'teaching', '8,9,10'])
  ws.addRow(['Suresh Patel', 'suresh@school.com', '', '9876543212', 'Admin', '', '2021-01-10', 'non_teaching', ''])

  // Subject dropdown, applied to a generous range of data rows. Excel's
  // inline list formula ('"A,B,C"') caps out around 255 characters, which a
  // long subject list could exceed — so the allowed values live on a hidden
  // reference sheet instead, and the dropdown points at that range.
  const lastRow = 501 // header + the same 500-row ceiling enforced by the API
  if (subjectNames.length > 0) {
    const refSheet = wb.addWorksheet('_subjects')
    refSheet.state = 'veryHidden'
    subjectNames.forEach((name, i) => { refSheet.getCell(`A${i + 1}`).value = name })

    for (let r = 2; r <= lastRow; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`_subjects!$A$1:$A$${subjectNames.length}`],
        showErrorMessage: true,
        errorTitle: 'Not in the subject list',
        error: 'Pick a subject from the dropdown, or leave blank for non-teaching staff.',
      }
    }
  }

  // Staff Type dropdown (column H) — the same two values accepted by the UI
  // and API. Invalid values are rejected server-side.
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`H${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"teaching,non_teaching"'],
      showErrorMessage: true,
      errorTitle: 'Invalid staff type',
      error: 'Pick either teaching or non_teaching.',
    }
  }

  // Teaches Grades dropdown (column I) — same grade list InlineGrades offers
  // in the manual table. Excel data validation only picks ONE list value per
  // cell, so multi-grade selection ("8,9,10") still has to be typed by hand;
  // the dropdown's job is just making sure each value typed is a real grade,
  // not open-ended free text. The note row below spells out the comma format.
  const gradeRefSheet = wb.addWorksheet('_grades')
  gradeRefSheet.state = 'veryHidden'
  const numericGrades = Array.from({ length: 10 }, (_, i) => String(i + 1))
  numericGrades.forEach((g, i) => { gradeRefSheet.getCell(`A${i + 1}`).value = g })
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`I${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`_grades!$A$1:$A$${numericGrades.length}`],
      showErrorMessage: false, // free text like "8,9,10" is valid here — see note row
    }
  }

  // Note row
  const noteRow = ws.addRow([])
  ws.mergeCells(`A${noteRow.number}:I${noteRow.number}`)
  const noteCell = ws.getCell(`A${noteRow.number}`)
  const customCount = subjectOptions.filter(option => option.source === 'custom').length
  const subjectNote = `Subject contains the full master syllabus${customCount ? ` plus ${customCount} custom subject${customCount === 1 ? '' : 's'} from this school` : ''} — click the cell and use the dropdown.`
  noteCell.value = `★ Yellow columns are MANDATORY. ${subjectNote} Non-teaching staff can leave Subject blank. Staff Type: pick teaching or non_teaching from the dropdown. Teaches Grades: for one grade, use the dropdown — for several, type them comma-separated with no spaces, e.g. 8,9,10 (leave blank to teach all grades).`
  noteCell.font = { italic: true, color: { argb: 'FFB45309' }, size: 9 }
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E6' } }
  noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="staff_template.xlsx"',
    },
  })
}
