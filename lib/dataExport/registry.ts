import pool from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getClassForSchool, nonWorkingDaysMap } from '@/lib/attendance'
import { addDays, attendancePercent, isAttended, isValidDateStr, isValidMonthStr, monthBounds } from '@/lib/attendanceRules'
import { computeRecipients } from '@/lib/announcementAudience'
import type { TargetClass } from '@/lib/announcements'
import { ExportError, type Cell, type ExportContext, type ExportDef, type ExportGroup, type ExportTable, type Params } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// The catalog of everything a school can download. One entry per export; the screen, the catalog route
// and the download route are all generated from this list. To add a feature's export, add an entry here
// (and its feature key) — see .claude/skills/update-product-docs.
// ─────────────────────────────────────────────────────────────────────────────

export const GROUPS: Array<{ key: ExportGroup; label: string; description: string }> = [
  { key: 'people', label: 'People', description: 'Students, staff and parents' },
  { key: 'academics', label: 'Academics', description: 'Classes, subjects, exams, syllabus and history' },
  { key: 'attendance', label: 'Attendance', description: 'Registers, absentees and percentages' },
  { key: 'fees', label: 'Fees', description: 'Structure, dues, payments and waivers' },
  { key: 'expenses', label: 'Expenses', description: 'What the school spent' },
  { key: 'other', label: 'Calendar & notices', description: 'Holidays and announcement history' },
  { key: 'backup', label: 'Backup', description: 'Everything in one workbook' },
]

const MAX_RANGE_DAYS = 366
const MAX_ROWS = 100_000

// ── filter helpers ───────────────────────────────────────────────────────────
const YEAR_RE = /^\d{4}-\d{2}$/
function optDate(p: Params, key: string): string | null {
  const v = p[key]
  if (!v) return null
  if (!isValidDateStr(v)) throw new ExportError(400, `${key} must be a date (YYYY-MM-DD)`)
  return v
}
function reqDate(p: Params, key: string): string {
  const v = optDate(p, key)
  if (!v) throw new ExportError(400, `${key} is required`)
  return v
}
function dateRange(p: Params, required: boolean): { from: string | null; to: string | null } {
  const from = required ? reqDate(p, 'from') : optDate(p, 'from')
  const to = required ? reqDate(p, 'to') : optDate(p, 'to')
  if (from && to) {
    if (to < from) throw new ExportError(400, 'From must be on or before To')
    if (addDays(from, MAX_RANGE_DAYS) < to) throw new ExportError(400, `Choose a range of at most ${MAX_RANGE_DAYS} days`)
  }
  return { from, to }
}
function optYear(p: Params): string | null {
  const v = p.academic_year
  if (!v) return null
  if (!YEAR_RE.test(v)) throw new ExportError(400, 'academic_year must look like 2026-27')
  return v
}
function reqYear(p: Params): string {
  const v = optYear(p)
  if (!v) throw new ExportError(400, 'academic_year is required')
  return v
}
async function classOf(ctx: ExportContext, p: Params, required: boolean) {
  const raw = p.class_id
  if (!raw) { if (required) throw new ExportError(400, 'Choose a class'); return null }
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new ExportError(400, 'Invalid class')
  const c = await getClassForSchool(ctx.schoolId, id)
  if (!c) throw new ExportError(404, 'Class not found')
  return c
}
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
const money = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100
const t = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const STUDENT_ORDER = `${gradeOrderSql('s.grade')}, s.section, s.school_roll_number NULLS LAST, s.name`
const ACTIVE_STUDENT = `(s.status IS NULL OR s.status = 'active')`

// ─────────────────────────────────────────────────────────────────────────────
// PEOPLE
// ─────────────────────────────────────────────────────────────────────────────
async function studentsTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const status = p.status || 'active'
  if (!['active', 'graduated', 'other', 'all'].includes(status)) throw new ExportError(400, 'Invalid status')
  const values: unknown[] = [ctx.schoolId]
  const where = ['s.school_id = $1']
  if (p.grade) { values.push(p.grade); where.push(`s.grade = $${values.length}`) }
  if (p.section) { values.push(p.section); where.push(`s.section = $${values.length}`) }
  if (status === 'active') where.push(ACTIVE_STUDENT)
  else if (status === 'graduated') where.push(`s.status = 'graduated'`)
  else if (status === 'other') where.push(`s.status IS NOT NULL AND s.status NOT IN ('active','graduated')`)
  const { rows } = await pool.query(
    `SELECT s.school_roll_number, s.name, s.grade, s.section, s.date_of_birth::text AS dob, s.email, s.phone,
            s.parent_name, s.parent_phone, s.parent_email, COALESCE(s.status,'active') AS status,
            (s.password_hash IS NOT NULL) AS has_login, s.created_at::date::text AS joined
     FROM students s WHERE ${where.join(' AND ')} ORDER BY ${STUDENT_ORDER}`, values)
  return [{
    name: 'Students',
    header: ['Class roll no', 'Name', 'Grade', 'Section', 'Date of birth', 'Student email', 'Student phone', 'Parent name', 'Parent phone', 'Parent email', 'Status', 'Portal login created', 'Joined'],
    rows: rows.map(r => [r.school_roll_number ?? '', r.name, t(r.grade), t(r.section), t(r.dob), t(r.email), t(r.phone), t(r.parent_name), t(r.parent_phone), t(r.parent_email), r.status, r.has_login ? 'Yes' : 'No', t(r.joined)]),
  }]
}

async function rollListTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const c = await classOf(ctx, p, true)
  const { rows } = await pool.query(
    `SELECT s.school_roll_number, s.name, s.date_of_birth::text AS dob, s.parent_name, s.parent_phone
     FROM students s WHERE s.school_id = $1 AND s.grade = $2 AND s.section = $3 AND ${ACTIVE_STUDENT}
     ORDER BY s.school_roll_number NULLS LAST, s.name`, [ctx.schoolId, c!.grade, c!.section])
  return [{
    name: `Class ${c!.grade}-${c!.section}`,
    title: [`Class roll list — Grade ${c!.grade} Section ${c!.section} — ${rows.length} students`],
    header: ['Roll no', 'Name', 'Date of birth', 'Parent name', 'Parent phone'],
    rows: rows.map(r => [r.school_roll_number ?? '', r.name, t(r.dob), t(r.parent_name), t(r.parent_phone)]),
  }]
}

async function parentsTable(ctx: ExportContext): Promise<ExportTable[]> {
  const { rows } = await pool.query(
    `SELECT p.name, p.phone, p.email,
            string_agg(s.name || ' (' || COALESCE(s.grade,'') || '-' || COALESCE(s.section,'') || ')', '; ' ORDER BY s.name) AS children
     FROM parents p
     JOIN student_parents sp ON sp.parent_id = p.id
     JOIN students s ON s.id = sp.student_id AND ${ACTIVE_STUDENT}
     WHERE p.school_id = $1 GROUP BY p.id ORDER BY p.name`, [ctx.schoolId])
  return [{ name: 'Parents', header: ['Parent name', 'Phone', 'Email', 'Children (class)'], rows: rows.map(r => [t(r.name), t(r.phone), t(r.email), t(r.children)]) }]
}

async function teachersTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const includeAll = p.status === 'all'
  const { rows } = await pool.query(
    `SELECT t.employee_id, t.name, COALESCE(t.staff_type,'teaching') AS staff_type, t.subject, t.department, t.qualification,
            t.phone, t.email, t.date_of_birth::text AS dob, t.date_of_joining::text AS joined, t.teaches_grades,
            (SELECT string_agg(c.grade || '-' || c.section, ', ' ORDER BY c.grade, c.section) FROM classes c
              WHERE c.class_teacher_id = t.id AND c.deleted_at IS NULL) AS class_teacher_of,
            CASE WHEN t.removed_at IS NOT NULL THEN 'removed' ELSE COALESCE(t.status,'active') END AS status,
            (t.password_hash IS NOT NULL) AS has_login
     FROM teachers t WHERE t.school_id = $1 ${includeAll ? '' : 'AND t.removed_at IS NULL'}
     ORDER BY t.name`, [ctx.schoolId])
  return [{
    name: 'Staff',
    header: ['Employee id', 'Name', 'Staff type', 'Subject', 'Department', 'Qualification', 'Phone', 'Email', 'Date of birth', 'Date of joining', 'Teaches grades', 'Class teacher of', 'Status', 'Portal login created'],
    rows: rows.map(r => [t(r.employee_id), t(r.name), r.staff_type, t(r.subject), t(r.department), t(r.qualification), t(r.phone), t(r.email), t(r.dob), t(r.joined), t(r.teaches_grades), t(r.class_teacher_of), r.status, r.has_login ? 'Yes' : 'No']),
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMICS
// ─────────────────────────────────────────────────────────────────────────────
async function classesTable(ctx: ExportContext): Promise<ExportTable[]> {
  const { rows } = await pool.query(
    `SELECT c.grade, c.section, tt.name AS class_teacher,
            (SELECT COUNT(*)::int FROM students s WHERE s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section AND ${ACTIVE_STUDENT}) AS students
     FROM classes c LEFT JOIN teachers tt ON tt.id = c.class_teacher_id
     WHERE c.school_id = $1 AND c.deleted_at IS NULL ORDER BY ${gradeOrderSql('c.grade')}, c.section`, [ctx.schoolId])
  return [{ name: 'Classes', header: ['Grade', 'Section', 'Class teacher', 'Students'], rows: rows.map(r => [r.grade, r.section, t(r.class_teacher), r.students]) }]
}

async function classSubjectsTable(ctx: ExportContext): Promise<ExportTable[]> {
  const { rows } = await pool.query(
    `SELECT c.grade, c.section, cs.subject_name, tt.name AS teacher
     FROM class_subjects cs JOIN classes c ON c.id = cs.class_id AND c.deleted_at IS NULL
     LEFT JOIN teachers tt ON tt.id = cs.teacher_id
     WHERE c.school_id = $1 ORDER BY ${gradeOrderSql('c.grade')}, c.section, cs.subject_name`, [ctx.schoolId])
  return [{ name: 'Class subjects', header: ['Grade', 'Section', 'Subject', 'Teacher'], rows: rows.map(r => [r.grade, r.section, r.subject_name, t(r.teacher)]) }]
}

async function examScheduleTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, false)
  const values: unknown[] = [ctx.schoolId]
  const where = ['e.school_id = $1']
  if (from) { values.push(from); where.push(`e.exam_date >= $${values.length}`) }
  if (to) { values.push(to); where.push(`e.exam_date <= $${values.length}`) }
  const { rows } = await pool.query(
    `SELECT e.exam_name, e.exam_type, c.grade, c.section, e.exam_date::text AS exam_date, e.status, e.passing_pct,
            e.released_at::date::text AS released,
            (SELECT string_agg(es.subject_name || ' (' || es.max_marks || ')', ', ' ORDER BY es.subject_name) FROM exam_subjects es WHERE es.exam_id = e.id) AS subjects
     FROM exam_records e JOIN classes c ON c.id = e.class_id
     WHERE ${where.join(' AND ')} ORDER BY e.exam_date NULLS LAST, ${gradeOrderSql('c.grade')}, c.section, e.exam_name`, values)
  return [{
    name: 'Exam schedule',
    header: ['Exam', 'Type', 'Grade', 'Section', 'Date', 'Status', 'Passing %', 'Results released', 'Subjects (max marks)'],
    rows: rows.map(r => [r.exam_name, r.exam_type, r.grade, r.section, t(r.exam_date), r.status, r.passing_pct, t(r.released), t(r.subjects)]),
  }]
}

async function resultsTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const id = Number(p.exam_id)
  if (!Number.isInteger(id) || id <= 0) throw new ExportError(400, 'Choose an exam')
  const { rows: [exam] } = await pool.query(
    `SELECT e.exam_name, e.exam_date::text AS exam_date, e.passing_pct, c.grade, c.section
     FROM exam_records e JOIN classes c ON c.id = e.class_id WHERE e.id = $1 AND e.school_id = $2`, [id, ctx.schoolId])
  if (!exam) throw new ExportError(404, 'Exam not found')
  const { rows: subjects } = await pool.query<{ subject_name: string; max_marks: number }>(
    `SELECT subject_name, max_marks FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`, [id])
  const { rows: students } = await pool.query(
    `SELECT s.id, s.name, s.school_roll_number FROM students s
     WHERE s.school_id = $1 AND s.grade = $2 AND s.section = $3 AND ${ACTIVE_STUDENT}
     ORDER BY s.school_roll_number NULLS LAST, s.name`, [ctx.schoolId, exam.grade, exam.section])
  const { rows: marks } = await pool.query(
    `SELECT student_id, subject_name, marks_obtained, is_absent FROM exam_marks WHERE exam_id = $1 AND school_id = $2`, [id, ctx.schoolId])
  const byStudent = new Map<number, Map<string, { m: number | null; abs: boolean }>>()
  for (const m of marks) {
    const sm = byStudent.get(m.student_id) ?? new Map()
    sm.set(m.subject_name, { m: m.marks_obtained === null ? null : Number(m.marks_obtained), abs: !!m.is_absent })
    byStudent.set(m.student_id, sm)
  }
  const totalMax = subjects.reduce((a, s) => a + s.max_marks, 0)
  const rows: Cell[][] = students.map(st => {
    const sm = byStudent.get(st.id)
    let total = 0, absent = false, missing = false
    const cells = subjects.map(sub => {
      const v = sm?.get(sub.subject_name)
      if (!v) { missing = true; return '' }
      if (v.abs) { absent = true; return 'Absent' }
      if (v.m === null) { missing = true; return '' }
      total += v.m
      return v.m
    })
    const pct = totalMax > 0 ? Math.round((total / totalMax) * 1000) / 10 : null
    const result = absent ? 'Absent' : missing ? 'Incomplete' : total >= totalMax * (exam.passing_pct / 100) ? 'PASS' : 'FAIL'
    return [st.school_roll_number ?? '', st.name, ...cells, total, pct === null ? '' : pct, result]
  })
  return [{
    name: 'Results',
    title: [`${exam.exam_name} | Grade ${exam.grade}-${exam.section} | ${exam.exam_date ?? ''} | pass mark ${exam.passing_pct}%`],
    header: ['Roll no', 'Student', ...subjects.map(s => `${s.subject_name} (max ${s.max_marks})`), `Total (max ${totalMax})`, 'Percentage', 'Result'],
    rows,
  }]
}

async function classHistoryTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = optYear(p)
  const values: unknown[] = [ctx.schoolId]
  let cond = ''
  if (year) { values.push(year); cond = `AND ay.label = $2` }
  const { rows } = await pool.query(
    `SELECT ay.label, s.name, h.grade, h.section, h.school_roll_number, h.outcome, h.promoted_to_grade, h.promoted_to_section
     FROM student_class_history h
     JOIN academic_years ay ON ay.id = h.academic_year_id
     JOIN students s ON s.id = h.student_id
     WHERE h.school_id = $1 ${cond}
     ORDER BY ay.start_date DESC, ${gradeOrderSql('h.grade')}, h.section, h.school_roll_number NULLS LAST, s.name`, values)
  return [{
    name: 'Class history',
    header: ['Academic year', 'Student', 'Grade', 'Section', 'Class roll no', 'Outcome', 'Moved to grade', 'Moved to section'],
    rows: rows.map(r => [r.label, r.name, r.grade, r.section, r.school_roll_number ?? '', t(r.outcome) || (r.promoted_to_grade ? 'promoted' : 'graduated'), t(r.promoted_to_grade), t(r.promoted_to_section)]),
  }]
}

async function syllabusTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const values: unknown[] = [ctx.schoolId]
  let cond = ''
  if (p.grade) { values.push(p.grade); cond = `AND c.grade = $2` }
  const { rows } = await pool.query(
    `SELECT c.grade, c.section, ss.subject_name, COUNT(DISTINCT sc.id)::int AS chapters, COUNT(st.id)::int AS topics,
            COUNT(st.id) FILTER (WHERE stp.status = 'covered')::int AS covered
     FROM classes c
     JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade
     JOIN school_chapters sc ON sc.school_subject_id = ss.id
     JOIN school_topics st ON st.school_chapter_id = sc.id
     LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = c.id
     WHERE c.school_id = $1 AND c.deleted_at IS NULL ${cond}
     GROUP BY c.id, c.grade, c.section, ss.subject_name
     ORDER BY ${gradeOrderSql('c.grade')}, c.section, ss.subject_name`, values)
  return [{
    name: 'Syllabus progress',
    header: ['Grade', 'Section', 'Subject', 'Chapters', 'Topics', 'Topics covered', 'Covered %'],
    rows: rows.map(r => [r.grade, r.section, r.subject_name, r.chapters, r.topics, r.covered, r.topics ? Math.round((r.covered / r.topics) * 1000) / 10 : 0]),
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────
async function registerTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const c = await classOf(ctx, p, true)
  const { from, to } = dateRange(p, true)
  const [{ rows }, nonWorking] = await Promise.all([
    pool.query(
      `SELECT s.name AS student_name, s.school_roll_number, a.date::text AS date,
              MAX(CASE WHEN a.session = 'morning'   THEN a.status END) AS morning,
              MAX(CASE WHEN a.session = 'afternoon' THEN a.status END) AS afternoon
       FROM attendance a JOIN students s ON s.id = a.student_id AND s.school_id = $1
       WHERE a.school_id = $1 AND a.class_id = $2 AND a.date BETWEEN $3::date AND $4::date AND ${ACTIVE_STUDENT}
       GROUP BY s.id, s.name, s.school_roll_number, a.date
       ORDER BY a.date, s.school_roll_number NULLS LAST, s.name`, [ctx.schoolId, c!.id, from, to]),
    nonWorkingDaysMap(ctx.schoolId, from!, to!),
  ])
  return [{
    name: 'Register',
    title: [`Attendance register — Grade ${c!.grade}-${c!.section} — ${from} to ${to}`],
    header: ['Date', 'Roll no', 'Student', 'Morning', 'Afternoon', 'Day type'],
    rows: rows.map(r => {
      const nw = nonWorking.get(r.date)
      return [r.date, r.school_roll_number ?? '', r.student_name, r.morning ?? 'not marked', r.afternoon ?? 'not marked',
        nw ? (nw.kind === 'holiday' ? `Holiday: ${nw.title} (ignored in reports)` : 'Weekly off (ignored in reports)') : 'Working day']
    }),
  }]
}

async function absenteesTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const date = reqDate(p, 'date')
  const c = await classOf(ctx, p, false)
  const nw = (await nonWorkingDaysMap(ctx.schoolId, date, date)).get(date)
  if (nw) throw new ExportError(409, `${date} is not a working day (${nw.title}).`)
  const { rows } = await pool.query(
    `SELECT cl.grade, cl.section, s.school_roll_number, s.name AS student_name, s.parent_name, s.parent_phone,
            BOOL_OR(a.session = 'morning') AS am, BOOL_OR(a.session = 'afternoon') AS pm
     FROM attendance a
     JOIN students s ON s.id = a.student_id AND s.school_id = $1
     JOIN classes cl ON cl.id = a.class_id AND cl.school_id = $1
     WHERE a.school_id = $1 AND a.date = $2::date AND a.status = 'absent' AND ($3::int IS NULL OR a.class_id = $3)
     GROUP BY cl.grade, cl.section, s.id, s.school_roll_number, s.name, s.parent_name, s.parent_phone
     ORDER BY ${gradeOrderSql('cl.grade')}, cl.section, s.school_roll_number NULLS LAST, s.name`, [ctx.schoolId, date, c?.id ?? null])
  return [{
    name: 'Absentees',
    title: [`Absentees on ${date}${c ? ` — Grade ${c.grade}-${c.section}` : ' — whole school'}`],
    header: ['Grade', 'Section', 'Roll no', 'Student', 'Absent in', 'Parent', 'Parent phone'],
    rows: rows.map(r => [r.grade, r.section, r.school_roll_number ?? '', r.student_name, r.am && r.pm ? 'Morning + Afternoon' : r.am ? 'Morning' : 'Afternoon', t(r.parent_name), t(r.parent_phone)]),
  }]
}

// Attended (present + late) ÷ marked sessions per student, working days only — the same rules as every dashboard.
async function percentages(ctx: ExportContext, from: string, to: string, classId: number | null) {
  const [{ rows }, nonWorking] = await Promise.all([
    pool.query(
      `SELECT s.id, s.name, s.school_roll_number, c.grade, c.section, s.parent_name, s.parent_phone,
              a.date::text AS date, a.status
       FROM attendance a
       JOIN students s ON s.id = a.student_id AND s.school_id = $1 AND ${ACTIVE_STUDENT}
       JOIN classes c ON c.id = a.class_id AND c.school_id = $1
       WHERE a.school_id = $1 AND a.date BETWEEN $2::date AND $3::date AND ($4::int IS NULL OR a.class_id = $4)`,
      [ctx.schoolId, from, to, classId]),
    nonWorkingDaysMap(ctx.schoolId, from, to),
  ])
  const per = new Map<number, { name: string; roll: number | null; grade: string; section: string; parent: string; phone: string; present: number; late: number; absent: number }>()
  for (const r of rows) {
    if (nonWorking.has(r.date)) continue
    const cur = per.get(r.id) ?? { name: r.name, roll: r.school_roll_number, grade: r.grade, section: r.section, parent: t(r.parent_name), phone: t(r.parent_phone), present: 0, late: 0, absent: 0 }
    if (r.status === 'absent') cur.absent++
    else if (r.status === 'late') cur.late++
    else if (isAttended(r.status)) cur.present++
    per.set(r.id, cur)
  }
  return Array.from(per.values()).map(v => {
    const marked = v.present + v.late + v.absent
    return { ...v, marked, pct: attendancePercent(v.present + v.late, marked) }
  }).sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.section.localeCompare(b.section) || (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name))
}

async function attendanceSummaryTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const c = await classOf(ctx, p, true)
  if (!isValidMonthStr(p.month)) throw new ExportError(400, 'Choose a month')
  const { from, to } = monthBounds(p.month)
  const list = await percentages(ctx, from, to, c!.id)
  return [{
    name: 'Monthly summary',
    title: [`Attendance summary — Grade ${c!.grade}-${c!.section} — ${p.month} (holidays and weekly-off days excluded; late counts as attended)`],
    header: ['Roll no', 'Student', 'Present', 'Late', 'Absent', 'Marked sessions', 'Attendance %'],
    rows: list.map(v => [v.roll ?? '', v.name, v.present, v.late, v.absent, v.marked, v.pct === null ? '' : v.pct]),
  }]
}

async function lowAttendanceTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, true)
  const threshold = Number(p.threshold || 75)
  if (![60, 75, 85, 90].includes(threshold)) throw new ExportError(400, 'Invalid threshold')
  const list = (await percentages(ctx, from!, to!, null)).filter(v => v.marked >= 4 && v.pct !== null && v.pct < threshold)
    .sort((a, b) => (a.pct as number) - (b.pct as number))
  return [{
    name: 'Low attendance',
    title: [`Students below ${threshold}% attendance — ${from} to ${to} (at least 4 marked sessions)`],
    header: ['Grade', 'Section', 'Roll no', 'Student', 'Attendance %', 'Absent sessions', 'Marked sessions', 'Parent', 'Parent phone'],
    rows: list.map(v => [v.grade, v.section, v.roll ?? '', v.name, v.pct as number, v.absent, v.marked, v.parent, v.phone]),
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// FEES
// ─────────────────────────────────────────────────────────────────────────────
async function feeStructureTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = optYear(p)
  const values: unknown[] = [ctx.schoolId]
  let cond = ''
  if (year) { values.push(year); cond = 'AND fs.academic_year = $2' }
  const { rows } = await pool.query(
    `SELECT fs.academic_year, fc.name, fc.frequency, fs.grade, fs.amount, fs.due_day
     FROM fee_structures fs JOIN fee_categories fc ON fc.id = fs.fee_category_id
     WHERE fs.school_id = $1 ${cond} ORDER BY fs.academic_year DESC, fc.name, ${gradeOrderSql('fs.grade')}`, values)
  return [{ name: 'Fee structure', header: ['Academic year', 'Fee head', 'Frequency', 'Grade', 'Amount', 'Due day'], rows: rows.map(r => [r.academic_year, r.name, r.frequency, r.grade, money(r.amount), r.due_day ?? '']) }]
}

async function feeLedgerTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = optYear(p)
  const status = p.status || 'all'
  if (!['all', 'outstanding', 'pending', 'partial', 'overdue', 'paid', 'waived'].includes(status)) throw new ExportError(400, 'Invalid status')
  const values: unknown[] = [ctx.schoolId]
  const where = ['l.school_id = $1']
  if (year) { values.push(year); where.push(`l.academic_year = $${values.length}`) }
  if (p.grade) { values.push(p.grade); where.push(`s.grade = $${values.length}`) }
  if (status === 'outstanding') where.push(`GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0`)
  else if (status !== 'all') { values.push(status); where.push(`l.status = $${values.length}`) }
  const { rows } = await pool.query(
    `SELECT l.academic_year, s.name AS student_name, s.school_roll_number, s.grade, s.section, s.parent_name, s.parent_phone,
            fc.name AS category_name, l.period_label, l.amount_due, l.amount_paid, COALESCE(l.waiver_amount,0) AS waiver,
            GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) AS balance, l.due_date::text AS due_date, l.status
     FROM student_fee_ledger l JOIN students s ON s.id = l.student_id JOIN fee_categories fc ON fc.id = l.fee_category_id
     WHERE ${where.join(' AND ')} ORDER BY l.academic_year DESC, ${gradeOrderSql('s.grade')}, s.section, s.name, l.due_date`, values)
  return [{
    name: 'Fee ledger',
    header: ['Academic year', 'Student', 'Roll no', 'Grade', 'Section', 'Parent', 'Parent phone', 'Fee head', 'Period', 'Amount due', 'Paid', 'Waived', 'Balance', 'Due date', 'Status'],
    rows: rows.map(r => [r.academic_year, r.student_name, r.school_roll_number ?? '', t(r.grade), t(r.section), t(r.parent_name), t(r.parent_phone), r.category_name, t(r.period_label), money(r.amount_due), money(r.amount_paid), money(r.waiver), money(r.balance), t(r.due_date), r.status]),
  }]
}

async function feePaymentsTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = optYear(p)
  const { from, to } = dateRange(p, false)
  const values: unknown[] = [ctx.schoolId]
  const where = ['fp.school_id = $1']
  if (year) { values.push(year); where.push(`l.academic_year = $${values.length}`) }
  if (from) { values.push(from); where.push(`fp.paid_date >= $${values.length}`) }
  if (to) { values.push(to); where.push(`fp.paid_date <= $${values.length}`) }
  // Cancelled receipts are included (with the reason) so the receipt-number sequence has no unexplained gaps.
  const { rows } = await pool.query(
    `SELECT fp.paid_date::text AS paid_date, fp.receipt_number, s.name AS student_name, s.school_roll_number, s.grade, s.section,
            fc.name AS category_name, l.period_label, fp.amount, fp.payment_mode, fp.payment_status, fp.transaction_ref,
            fp.collected_by_name, fp.notes, fp.cancelled_by, fp.cancel_reason
     FROM fee_payments fp JOIN students s ON s.id = fp.student_id
     JOIN student_fee_ledger l ON l.id = fp.ledger_id JOIN fee_categories fc ON fc.id = l.fee_category_id
     WHERE ${where.join(' AND ')} ORDER BY fp.paid_date DESC, fp.id DESC`, values)
  return [{
    name: 'Payments',
    header: ['Date', 'Receipt no', 'Student', 'Roll no', 'Grade', 'Section', 'Fee head', 'Period', 'Amount', 'Mode', 'Status', 'Reference', 'Collected by', 'Notes', 'Cancelled by', 'Cancel reason'],
    rows: rows.map(r => [r.paid_date, t(r.receipt_number), r.student_name, r.school_roll_number ?? '', t(r.grade), t(r.section), r.category_name, t(r.period_label), money(r.amount), r.payment_mode, r.payment_status, t(r.transaction_ref), t(r.collected_by_name), t(r.notes), t(r.cancelled_by), t(r.cancel_reason)]),
  }]
}

async function defaultersTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = reqYear(p)
  const values: unknown[] = [ctx.schoolId, year]
  let cond = ''
  if (p.grade) { values.push(p.grade); cond = `AND s.grade = $3` }
  const { rows } = await pool.query(
    `SELECT s.name, s.school_roll_number, s.grade, s.section, s.parent_name, s.parent_phone,
            SUM(l.amount_due) AS due, SUM(l.amount_paid) AS paid, SUM(COALESCE(l.waiver_amount,0)) AS waived,
            SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) AS balance,
            MIN(l.due_date) FILTER (WHERE GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0) AS oldest_due
     FROM student_fee_ledger l JOIN students s ON s.id = l.student_id
     WHERE l.school_id = $1 AND l.academic_year = $2 AND ${ACTIVE_STUDENT} ${cond}
     GROUP BY s.id HAVING SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) > 0
     ORDER BY SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) DESC`, values)
  const total = rows.reduce((a, r) => a + Number(r.balance), 0)
  return [{
    name: 'Defaulters',
    title: [`Fee defaulters — ${year}${p.grade ? ` — Grade ${p.grade}` : ''} — ${rows.length} students, total balance ${money(total)}`],
    header: ['Student', 'Roll no', 'Grade', 'Section', 'Parent', 'Parent phone', 'Total due', 'Paid', 'Waived', 'Balance', 'Oldest due date'],
    rows: rows.map(r => [r.name, r.school_roll_number ?? '', t(r.grade), t(r.section), t(r.parent_name), t(r.parent_phone), money(r.due), money(r.paid), money(r.waived), money(r.balance), r.oldest_due ? new Date(r.oldest_due).toLocaleDateString('en-CA') : '']),
  }]
}

async function dayCollectionTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const date = reqDate(p, 'date')
  const { rows } = await pool.query(
    `SELECT payment_mode, COUNT(*)::int AS receipts, SUM(amount) AS total
     FROM fee_payments WHERE school_id = $1 AND paid_date = $2::date AND payment_status = 'completed' AND cancelled_by IS NULL
     GROUP BY payment_mode ORDER BY SUM(amount) DESC`, [ctx.schoolId, date])
  const receipts = rows.reduce((a, r) => a + r.receipts, 0)
  const total = rows.reduce((a, r) => a + Number(r.total), 0)
  return [{
    name: 'Day collection',
    title: [`Fee collection on ${date}`],
    header: ['Payment mode', 'Receipts', 'Amount'],
    rows: [...rows.map(r => [r.payment_mode, r.receipts, money(r.total)] as Cell[]), ['TOTAL', receipts, money(total)]],
  }]
}

async function waiversTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const year = optYear(p)
  const values: unknown[] = [ctx.schoolId]
  let cond = ''
  if (year) { values.push(year); cond = 'AND l.academic_year = $2' }
  const { rows } = await pool.query(
    `SELECT w.created_at::date::text AS date, l.academic_year, s.name AS student_name, s.grade, s.section, fc.name AS category_name, l.period_label,
            w.waiver_type, w.waiver_value, w.waiver_amount, w.reason, w.granted_by_name, w.is_revoked, w.revoke_reason
     FROM fee_waivers w JOIN students s ON s.id = w.student_id
     LEFT JOIN student_fee_ledger l ON l.id = w.ledger_id LEFT JOIN fee_categories fc ON fc.id = l.fee_category_id
     WHERE w.school_id = $1 ${cond} ORDER BY w.created_at DESC`, values)
  return [{
    name: 'Waivers',
    header: ['Date', 'Academic year', 'Student', 'Grade', 'Section', 'Fee head', 'Period', 'Type', 'Value', 'Amount waived', 'Reason', 'Granted by', 'Revoked', 'Revoke reason'],
    rows: rows.map(r => [r.date, t(r.academic_year), r.student_name, t(r.grade), t(r.section), t(r.category_name), t(r.period_label), r.waiver_type, money(r.waiver_value), money(r.waiver_amount), t(r.reason), t(r.granted_by_name), r.is_revoked ? 'Yes' : 'No', t(r.revoke_reason)]),
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
async function expensesTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, false)
  const values: unknown[] = [ctx.schoolId]
  const where = ['e.school_id = $1', 'e.is_deleted = FALSE']
  if (from) { values.push(from); where.push(`e.expense_date >= $${values.length}`) }
  if (to) { values.push(to); where.push(`e.expense_date <= $${values.length}`) }
  if (p.category_id) {
    const id = Number(p.category_id)
    if (!Number.isInteger(id) || id <= 0) throw new ExportError(400, 'Invalid category')
    values.push(id); where.push(`e.category_id = $${values.length}`)
  }
  const { rows } = await pool.query(
    `SELECT e.voucher_number, e.expense_date::text AS date, e.title, ec.name AS category_name, e.payee_name, e.amount,
            e.payment_mode, e.transaction_ref, e.recorded_by_name, e.notes
     FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
     WHERE ${where.join(' AND ')} ORDER BY e.expense_date DESC, e.id DESC`, values)
  return [{
    name: 'Expenses',
    header: ['Voucher no', 'Date', 'Title', 'Category', 'Payee', 'Amount', 'Mode', 'Reference', 'Recorded by', 'Notes'],
    rows: rows.map(r => [t(r.voucher_number), r.date, r.title, r.category_name, t(r.payee_name), money(r.amount), r.payment_mode, t(r.transaction_ref), t(r.recorded_by_name), t(r.notes)]),
  }]
}

async function expenseSummaryTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, true)
  const { rows } = await pool.query(
    `SELECT ec.name, COUNT(*)::int AS entries, SUM(e.amount) AS total
     FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.school_id = $1 AND e.is_deleted = FALSE AND e.expense_date BETWEEN $2::date AND $3::date
     GROUP BY ec.name ORDER BY SUM(e.amount) DESC`, [ctx.schoolId, from, to])
  const total = rows.reduce((a, r) => a + Number(r.total), 0)
  return [{
    name: 'Expense summary',
    title: [`Expenses by category — ${from} to ${to}`],
    header: ['Category', 'Entries', 'Total', 'Share %'],
    rows: [...rows.map(r => [r.name, r.entries, money(r.total), total ? Math.round((Number(r.total) / total) * 1000) / 10 : 0] as Cell[]), ['TOTAL', rows.reduce((a, r) => a + r.entries, 0), money(total), total ? 100 : 0]],
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR & NOTICES
// ─────────────────────────────────────────────────────────────────────────────
async function holidaysTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, false)
  const values: unknown[] = [ctx.schoolId]
  const where = ['school_id = $1']
  if (from) { values.push(from); where.push(`COALESCE(end_date, event_date) >= $${values.length}`) }
  if (to) { values.push(to); where.push(`event_date <= $${values.length}`) }
  const { rows } = await pool.query(
    `SELECT title, event_type, event_date::text AS start, end_date::text AS finish, description
     FROM school_calendar WHERE ${where.join(' AND ')} ORDER BY event_date, id`, values)
  return [{ name: 'Calendar', header: ['Title', 'Type', 'Start', 'End', 'Description'], rows: rows.map(r => [r.title, r.event_type, r.start, t(r.finish), t(r.description)]) }]
}

async function announcementsTable(ctx: ExportContext, p: Params): Promise<ExportTable[]> {
  const { from, to } = dateRange(p, false)
  const values: unknown[] = [ctx.schoolId]
  const where = ['a.school_id = $1', 'a.deleted_at IS NULL', `a.status = 'published'`]
  if (from) { values.push(from); where.push(`COALESCE(a.publish_at, a.created_at)::date >= $${values.length}`) }
  if (to) { values.push(to); where.push(`COALESCE(a.publish_at, a.created_at)::date <= $${values.length}`) }
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.announcement_type, a.priority, a.target_audience, a.target_classes, a.created_by_name, a.requires_ack,
            COALESCE(a.publish_at, a.created_at)::date::text AS posted, a.expires_at::text AS expires,
            (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id) AS seen,
            (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id AND r.acked_at IS NOT NULL) AS acked
     FROM announcements a WHERE ${where.join(' AND ')} ORDER BY COALESCE(a.publish_at, a.created_at) DESC LIMIT 2000`, values)
  const cache = new Map<string, number>()
  const out: Cell[][] = []
  for (const r of rows) {
    const key = `${r.target_audience}|${JSON.stringify(r.target_classes)}`
    if (!cache.has(key)) {
      const rec = await computeRecipients(ctx.schoolId, r.target_audience, r.target_classes as TargetClass[] | null)
      cache.set(key, rec.teachers.length + rec.students.length + rec.parents.length)
    }
    const classes = (r.target_classes as TargetClass[] | null)?.map(c => (c.section ? `${c.grade}-${c.section}` : `Grade ${c.grade}`)).join(', ') ?? ''
    out.push([r.posted, r.title, r.announcement_type, r.priority, r.target_audience, classes || 'Whole school', t(r.created_by_name), cache.get(key) ?? 0, r.seen, r.requires_ack ? r.acked : '', t(r.expires)])
  }
  return [{ name: 'Announcements', header: ['Posted', 'Title', 'Type', 'Priority', 'Audience', 'Classes', 'Posted by', 'Recipients', 'Seen by', 'Acknowledged by', 'Expires'], rows: out }]
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog
// ─────────────────────────────────────────────────────────────────────────────
const gradeFilter = { key: 'grade', label: 'Grade', kind: 'grade' as const }
const yearFilter = (required: boolean) => ({ key: 'academic_year', label: 'Academic year', kind: 'year' as const, required })
const fromTo = (required: boolean) => [
  { key: 'from', label: 'From', kind: 'date' as const, required },
  { key: 'to', label: 'To', kind: 'date' as const, required },
]
const classFilter = { key: 'class_id', label: 'Class', kind: 'class' as const, required: true }

export const EXPORTS: ExportDef[] = [
  // People
  { key: 'students', group: 'people', label: 'Student list', description: 'Every student with class, roll number, parent contacts and portal-login status.', feature: 'students', formats: ['csv', 'xlsx'], personal: true,
    filters: [gradeFilter, { key: 'section', label: 'Section', kind: 'select', options: [] /* filled from classes by the catalog */ },
      { key: 'status', label: 'Status', kind: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'graduated', label: 'Graduated' }, { value: 'other', label: 'Left / inactive' }, { value: 'all', label: 'All' }] }],
    filename: p => `students${p.grade ? `_grade${slug(p.grade)}` : ''}${p.section ? `_${slug(p.section)}` : ''}_${p.status || 'active'}`, run: studentsTable },
  { key: 'class-roll-list', group: 'people', label: 'Class roll list', description: 'One class, in roll-number order — for the notice board or a class register.', feature: 'students', formats: ['csv', 'xlsx'], personal: true,
    filters: [classFilter], filename: p => `roll_list_${p.class_id}`, run: rollListTable },
  { key: 'parents', group: 'people', label: 'Parent contact list', description: 'One row per parent with phone, email and their children.', feature: 'students', formats: ['csv', 'xlsx'], personal: true,
    filters: [], filename: () => 'parent_contacts', run: ctx => parentsTable(ctx) },
  { key: 'teachers', group: 'people', label: 'Staff list', description: 'Teachers and staff with subject, class-teacher duty and contact details.', feature: 'staff', formats: ['csv', 'xlsx'], personal: true,
    filters: [{ key: 'status', label: 'Include', kind: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Current staff' }, { value: 'all', label: 'Including removed' }] }],
    filename: () => 'staff', run: teachersTable },

  // Academics
  { key: 'classes', group: 'academics', label: 'Classes', description: 'Every class and section with its class teacher and student count.', feature: 'class-management', formats: ['csv', 'xlsx'],
    filters: [], filename: () => 'classes', run: ctx => classesTable(ctx) },
  { key: 'class-subjects', group: 'academics', label: 'Subjects per class', description: 'Which subjects each class studies and who teaches them.', feature: 'class-management', formats: ['csv', 'xlsx'],
    filters: [], filename: () => 'class_subjects', run: ctx => classSubjectsTable(ctx) },
  { key: 'exam-schedule', group: 'academics', label: 'Exam schedule', description: 'Exams with class, date, status, pass mark and subjects.', feature: 'exam-marks', formats: ['csv', 'xlsx'],
    filters: fromTo(false), filename: () => 'exam_schedule', run: examScheduleTable },
  { key: 'exam-results', group: 'academics', label: 'Exam results (all subjects)', description: 'One exam: each student’s marks in every subject, total, percentage and pass / fail.', feature: 'exam-marks', formats: ['csv', 'xlsx'], personal: true,
    filters: [{ key: 'exam_id', label: 'Exam', kind: 'exam', required: true }], filename: p => `exam_results_${p.exam_id}`, run: resultsTable },
  { key: 'syllabus-progress', group: 'academics', label: 'Syllabus progress', description: 'Chapters and topics covered per class and subject.', feature: 'curriculum', formats: ['csv', 'xlsx'],
    filters: [gradeFilter], filename: () => 'syllabus_progress', run: syllabusTable },
  { key: 'class-history', group: 'academics', label: 'Past-year class history', description: 'Where each student was in earlier years, and whether they were promoted, repeated or graduated.', feature: 'year-rollover', formats: ['csv', 'xlsx'], personal: true,
    filters: [yearFilter(false)], filename: p => `class_history${p.academic_year ? `_${p.academic_year}` : ''}`, run: classHistoryTable },

  // Attendance
  { key: 'attendance-register', group: 'attendance', label: 'Attendance register', description: 'One class, day by day, morning and afternoon, with holidays labelled.', feature: 'attendance', formats: ['csv', 'xlsx'], personal: true,
    filters: [classFilter, ...fromTo(true)], filename: p => `attendance_${p.class_id}_${p.from}_to_${p.to}`, run: registerTable },
  { key: 'absentees', group: 'attendance', label: 'Daily absentee list', description: 'Who was absent on a day, with parent phone numbers — for phoning home and keying into LEAP.', feature: 'attendance', formats: ['csv', 'xlsx'], personal: true,
    filters: [{ key: 'date', label: 'Date', kind: 'date', required: true }, { key: 'class_id', label: 'Class (optional)', kind: 'class' }], filename: p => `absentees_${p.date}`, run: absenteesTable },
  { key: 'attendance-summary', group: 'attendance', label: 'Monthly attendance summary', description: 'Present, late, absent and attendance % for every student in a class for a month.', feature: 'attendance', formats: ['csv', 'xlsx'], personal: true,
    filters: [classFilter, { key: 'month', label: 'Month', kind: 'month', required: true }], filename: p => `attendance_summary_${p.class_id}_${p.month}`, run: attendanceSummaryTable },
  { key: 'low-attendance', group: 'attendance', label: 'Low-attendance list', description: 'Students below a chosen attendance % over a period, lowest first, with parent contacts.', feature: 'attendance', formats: ['csv', 'xlsx'], personal: true,
    filters: [...fromTo(true), { key: 'threshold', label: 'Below', kind: 'select', defaultValue: '75', options: [{ value: '60', label: '60%' }, { value: '75', label: '75%' }, { value: '85', label: '85%' }, { value: '90', label: '90%' }] }],
    filename: p => `low_attendance_${p.from}_to_${p.to}`, run: lowAttendanceTable },

  // Fees
  { key: 'fee-structure', group: 'fees', label: 'Fee structure', description: 'Every fee head with its amount per grade.', feature: 'fee-management', formats: ['csv', 'xlsx'],
    filters: [yearFilter(false)], filename: p => `fee_structure${p.academic_year ? `_${p.academic_year}` : ''}`, run: feeStructureTable },
  { key: 'fee-ledger', group: 'fees', label: 'Fee ledger (dues per student)', description: 'Each student’s bills: due, paid, waived, balance and status.', feature: 'fee-management', formats: ['csv', 'xlsx'], personal: true,
    filters: [yearFilter(false), gradeFilter, { key: 'status', label: 'Status', kind: 'select', defaultValue: 'all', options: [{ value: 'all', label: 'All' }, { value: 'outstanding', label: 'Outstanding only' }, { value: 'pending', label: 'Pending' }, { value: 'partial', label: 'Partly paid' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'waived', label: 'Waived' }] }],
    filename: p => `fee_ledger${p.academic_year ? `_${p.academic_year}` : ''}`, run: feeLedgerTable },
  { key: 'fee-defaulters', group: 'fees', label: 'Defaulters', description: 'Students with an unpaid balance, biggest first, with parent phone and oldest due date.', feature: 'fee-management', formats: ['csv', 'xlsx'], personal: true,
    filters: [yearFilter(true), gradeFilter], filename: p => `defaulters_${p.academic_year}`, run: defaultersTable },
  { key: 'fee-payments', group: 'fees', label: 'Payment register', description: 'Every receipt (including cancelled ones, with the reason) for reconciliation.', feature: 'fee-management', formats: ['csv', 'xlsx'], personal: true,
    filters: [yearFilter(false), ...fromTo(false)], filename: () => 'fee_payments', run: feePaymentsTable },
  { key: 'fee-day-collection', group: 'fees', label: 'Day collection', description: 'One day’s collection by payment mode (cash, UPI, cheque…) — for the day-end tally.', feature: 'fee-management', formats: ['csv', 'xlsx'],
    filters: [{ key: 'date', label: 'Date', kind: 'date', required: true, defaultValue: '' }], filename: p => `day_collection_${p.date}`, run: dayCollectionTable },
  { key: 'fee-waivers', group: 'fees', label: 'Waivers', description: 'Every waiver granted, with who granted it and why.', feature: 'fee-management', formats: ['csv', 'xlsx'], personal: true,
    filters: [yearFilter(false)], filename: p => `waivers${p.academic_year ? `_${p.academic_year}` : ''}`, run: waiversTable },

  // Expenses
  { key: 'expenses', group: 'expenses', label: 'Expense register', description: 'Every expense voucher with category, payee and payment mode.', feature: 'expenses', formats: ['csv', 'xlsx'],
    filters: [...fromTo(false), { key: 'category_id', label: 'Category', kind: 'expenseCategory' }], filename: () => 'expenses', run: expensesTable },
  { key: 'expense-summary', group: 'expenses', label: 'Expenses by category', description: 'Total spent per category over a period, with each category’s share.', feature: 'expenses', formats: ['csv', 'xlsx'],
    filters: fromTo(true), filename: p => `expense_summary_${p.from}_to_${p.to}`, run: expenseSummaryTable },

  // Calendar & notices
  { key: 'holidays', group: 'other', label: 'Holidays & events', description: 'The academic calendar: holidays, events and exams with dates.', feature: 'calendar', formats: ['csv', 'xlsx'],
    filters: fromTo(false), filename: () => 'calendar', run: holidaysTable },
  { key: 'announcements', group: 'other', label: 'Announcement history', description: 'Every notice sent: audience, classes, and how many people saw or acknowledged it.', feature: 'announcements', formats: ['csv', 'xlsx'],
    filters: fromTo(false), filename: () => 'announcements', run: announcementsTable },
]

// The backup workbook is assembled from the definitions above: one sheet per module the school has enabled.
export const BACKUP_KEYS = ['students', 'parents', 'teachers', 'classes', 'class-subjects', 'class-history', 'fee-structure', 'fee-ledger', 'fee-payments', 'fee-waivers', 'expenses', 'holidays', 'exam-schedule', 'announcements']

export function getExport(key: string): ExportDef | undefined {
  return EXPORTS.find(e => e.key === key)
}

export { MAX_ROWS, today }
