import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import pool from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireFeeAccess } from '@/lib/auth'

const MANDATORY_COLS = new Set(['Name', 'Email', 'Subject', 'Phone'])

// GET /api/teachers/template?school_id=X
// Same column layout as the plain-CSV template (name,email,subject,phone,
// department,qualification,date_of_joining,staff_type,teaches_grades), but
// the Subject column gets a real in-cell dropdown — the school's currently
// subscribed subjects when it has any, so a filled-in-Excel import can never
// introduce a spelling variant ("Mathematics") that silently fails to match
// school_subjects.subject_name the way free-typed CSV text can. If the
// school hasn't subscribed to anything (no Syllabus feature, or feature
// present but unused), fall back to the full platform master catalog —
// still a clean typo-proof list, just not narrowed to this school yet.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let subjectNames: string[] = []
  let isSubscribedList = false
  try {
    const academic_year = await resolveAcademicYear(school_id)
    const { rows } = await pool.query(
      'SELECT DISTINCT subject_name FROM school_subjects WHERE school_id = $1 AND academic_year = $2 ORDER BY subject_name',
      [school_id, academic_year]
    )
    subjectNames = rows.map(r => r.subject_name)
    isSubscribedList = subjectNames.length > 0
  } catch {
    // No academic year found at all — treated the same as zero subscriptions.
  }

  if (subjectNames.length === 0) {
    const { rows } = await pool.query('SELECT DISTINCT subject_name FROM master_subjects ORDER BY subject_name')
    subjectNames = rows.map(r => r.subject_name)
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Staff')

  const headers = [
    'Name', 'Email', 'Subject', 'Phone', 'Department',
    'Qualification', 'Date of Joining', 'Staff Type', 'Teaches Grades',
  ]
  ws.columns = headers.map(h => ({
    header: h, key: h,
    width: h === 'Email' ? 26 : h === 'Department' || h === 'Qualification' ? 18 : 16,
  }))

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
  ws.addRow(['Priya Sharma', 'priya@school.com', subjectNames[0] ?? 'Mathematics', '9876543210', 'Science', 'B.Ed', '2023-06-01', 'teaching', '8,9,10'])
  ws.addRow(['Suresh Patel', 'suresh@school.com', '', '9876543212', 'Admin', '', '2021-01-10', 'non_teaching', ''])

  // Subject dropdown, applied to a generous range of data rows. Excel's
  // inline list formula ('"A,B,C"') caps out around 255 characters, which a
  // long subject list could exceed — so the allowed values live on a hidden
  // reference sheet instead, and the dropdown points at that range.
  const lastRow = 1000 // comfortably covers a full staff roster in one upload
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

  // Staff Type dropdown (column H) — same two values the manual onboarding
  // table and the API both already accept (anything else normalizes to
  // 'teaching' server-side), given a real dropdown here so a typo can't
  // silently produce the wrong default.
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
  const subjectNote = isSubscribedList
    ? 'Subject must be one of the school’s subscribed subjects — click the cell and use the dropdown.'
    : 'This school hasn’t subscribed to any subjects yet, so Subject uses the full master catalog — click the cell and use the dropdown.'
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
