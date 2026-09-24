/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import ExcelJS from 'exceljs'
import { Pool } from 'pg'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Export Data (issue #206): every export in the catalog, filters, CSV + Excel, plan gating, permissions,
// formula safety, the full backup workbook and the export log. Plants attendance / exams / fees / expenses
// straight into the database — set E2E_DATABASE_URL to the app's (throwaway) database.

const DB_URL = process.env.E2E_DATABASE_URL
type Res = { status: number; body: any; headers: Headers }
const newCtx = () => pwRequest.newContext({ baseURL: BASE })
async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* csv */ }
  return { status: res.status(), body, headers: new Headers(res.headers()) }
}
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const iso = (d: Date) => d.toISOString().slice(0, 10)

const FEATURES = ['students', 'staff', 'class-management', 'attendance', 'curriculum', 'exam-marks', 'announcements', 'fee-management', 'expenses', 'calendar', 'export', 'year-rollover']

async function readSheets(buf: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}
const sheetRows = (ws: ExcelJS.Worksheet) => {
  const out: string[][] = []
  ws.eachRow(r => out.push((r.values as unknown[]).slice(1).map(v => (v === null || v === undefined ? '' : String(v)))))
  return out
}

test.describe.serial('Export Data', () => {
  test.skip(!DB_URL, "Set E2E_DATABASE_URL to the app's (throwaway) database to run this spec")
  const ts = Date.now() + 23
  const PASS = 'ExportData#2026x'
  let platform = ''
  let schoolId = 0, otherId = 0
  let admin: APIRequestContext, adminOther: APIRequestContext, anon: APIRequestContext, teacher: APIRequestContext
  let db: Pool
  let classA = 0
  let ashaId = 0, balaId = 0, evilId = 0, examId = 0
  let att1 = '', monthStr = '', monthFrom = '', monthTo = ''
  const AY = (() => { const y = Number(today.slice(0, 4)) - (today.slice(5, 7) >= '04' ? 0 : 1); return `${y}-${String(y + 1).slice(2)}` })()
  const phone = (n: number) => `9${String(ts + n).slice(-9)}`
  const dl = (as: APIRequestContext, key: string, qs = '', school = schoolId) => ctxGet(as, `/api/data-export/${key}?school_id=${school}${qs}`)
  async function ctxGet(as: APIRequestContext, url: string) {
    const res = await as.get(url)
    return { status: res.status(), buf: await res.body(), headers: new Headers(res.headers()), text: () => res.text() }
  }
  const csvRows = (buf: Buffer) => buf.toString('utf8').replace(/^﻿/, '').split('\r\n')

  test.beforeAll(async () => {
    test.setTimeout(300000)
    db = new Pool({ connectionString: DB_URL, max: 2 })
    platform = await platformAdminCookie()
    const tier = await (await fetch(`${BASE}/api/platform/features?tier=premium`, { headers: { Cookie: platform } })).json() as { enabled?: string[] }
    const missing = FEATURES.filter(k => !(tier.enabled ?? []).includes(k))
    if (missing.length) {
      if (process.env.E2E_ENABLE_PLAN_FEATURES !== '1') throw new Error(`${missing.join(', ')} off for the premium plan — set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway database`)
      const on = await fetch(`${BASE}/api/platform/features`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platform }, body: JSON.stringify({ assignments: missing.map(feature_key => ({ feature_key, tier: 'premium', enabled: true })) }) })
      if (!on.ok) throw new Error(`could not enable ${missing.join(', ')}: ${on.status}`)
    }

    const mkSchool = async (label: string, n: number, tier: string | null) => {
      const s = await createSchool(platform, { name: `${label} ${ts}`, email: `${label.toLowerCase().replace(/\W/g, '')}${ts}@e2etest.com`, phone: phone(n) })
      if (tier) await setSubscription(platform, s.id, tier)
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/auth/login', { email: s.email, password: s.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/auth/change-password', { newPassword: PASS })).status).toBe(200)
      return { id: s.id as number, ctx }
    }
    const a = await mkSchool('Export School', 90, 'premium'); schoolId = a.id; admin = a.ctx
    const b = await mkSchool('Export Other', 91, null); otherId = b.id; adminOther = b.ctx     // no plan features at all
    anon = await newCtx()
    expect((await call(admin, 'put', '/api/auth/profile', { full_name: `Export Principal ${ts}`, phone: '9000000042' })).status).toBe(200)

    const mk = async (grade: string, section: string) => (await call(admin, 'post', '/api/classes', { school_id: schoolId, grade, section })).body.id as number
    classA = await mk('10', 'A'); await mk('9', 'B')

    const bulkT = await call(admin, 'post', '/api/teachers/bulk', { school_id: schoolId, teachers: [{ name: 'Ms Rao', email: `rao${ts}@e2etest.com`, phone: phone(11), subject: 'Mathematics', staff_type: 'teaching' }] })
    expect(bulkT.status, JSON.stringify(bulkT.body)).toBe(201)
    const raoId = bulkT.body.teachers[0].id as number
    expect((await call(admin, 'put', `/api/classes/${classA}`, { class_teacher_id: raoId })).status).toBeLessThan(300)
    const tReset = await call(admin, 'post', `/api/teachers/${raoId}/reset-credentials`)
    teacher = await newCtx()
    expect((await call(teacher, 'post', '/api/teacher/auth/login', { email: `rao${ts}@e2etest.com`, password: tReset.body.temp_password })).status).toBe(200)

    const stu = (name: string, grade: string, section: string, roll: number, n: number) => ({ name, grade, section, school_roll_number: roll, parent_name: `Parent of ${name}`, parent_phone: phone(n), parent_email: `p${n}${ts}@e2etest.com` })
    const bulk = await call(admin, 'post', '/api/students/bulk', { school_id: schoolId, students: [
      stu('Asha Rao', '10', 'A', 1, 1), stu('Bala Krishna', '10', 'A', 2, 2), stu('Esha Reddy', '9', 'B', 1, 3), stu('Old Student', '10', 'A', 3, 4), stu('Evil Name', '9', 'B', 2, 5),
    ] })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    const roster = (await call(admin, 'get', `/api/students?school_id=${schoolId}`)).body as { id: number; name: string }[]
    const idOf = (n: string) => roster.find(s => s.name.startsWith(n))!.id
    ashaId = idOf('Asha'); balaId = idOf('Bala'); evilId = idOf('Evil')
    await db.query(`UPDATE students SET status = 'graduated' WHERE id = $1`, [idOf('Old')])
    await db.query(`UPDATE students SET name = $2 WHERE id = $1`, [evilId, "=HYPERLINK(\"http://evil\",\"x\")"])

    // Attendance: last month, four working days. Asha always present; Bala absent morning + afternoon on the first day.
    const now = new Date()
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const days: string[] = []
    for (let d = new Date(first); days.length < 4; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0) days.push(iso(d))
    att1 = days[0]; monthStr = att1.slice(0, 7)
    monthFrom = days[0]; monthTo = days[3]
    for (const day of days) for (const session of ['morning', 'afternoon']) {
      await db.query(`INSERT INTO attendance (school_id, class_id, student_id, date, session, status) VALUES ($1,$2,$3,$4,$5,'present')`, [schoolId, classA, ashaId, day, session])
      await db.query(`INSERT INTO attendance (school_id, class_id, student_id, date, session, status) VALUES ($1,$2,$3,$4,$5,$6)`, [schoolId, classA, balaId, day, session, day === att1 ? 'absent' : 'present'])
    }

    // Exam: Unit Test, Maths + Science out of 50, pass mark 35%. Asha 40+30 (PASS), Bala 10+12 (FAIL)
    const e = await db.query(`INSERT INTO exam_records (school_id, class_id, exam_name, exam_type, exam_date, status, passing_pct) VALUES ($1,$2,'Unit Test 1','unit_test',$3,'released',35) RETURNING id`, [schoolId, classA, today])
    examId = e.rows[0].id
    for (const sub of ['Maths', 'Science']) await db.query(`INSERT INTO exam_subjects (exam_id, school_id, subject_name, max_marks) VALUES ($1,$2,$3,50)`, [examId, schoolId, sub])
    const put = (student: number, subject: string, marks: number) => db.query(`INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained) VALUES ($1,$2,$3,$4,$5)`, [examId, schoolId, student, subject, marks])
    await put(ashaId, 'Maths', 40); await put(ashaId, 'Science', 30); await put(balaId, 'Maths', 10); await put(balaId, 'Science', 12)

    // Fees: Tuition ₹5000 for grade 10; Asha pays ₹2000 today (partial); Bala has a waiver
    const c = await call(admin, 'post', '/api/fees/categories', { school_id: schoolId, name: 'Tuition', frequency: 'annual', category_type: 'fixed' })
    expect(c.status, JSON.stringify(c.body)).toBe(201)
    expect((await call(admin, 'post', '/api/fees/structures', { school_id: schoolId, academic_year: AY, structures: [{ fee_category_id: c.body.id, grade: '10', amount: 5000, due_day: 10 }] })).status).toBe(201)
    expect([200, 201]).toContain((await call(admin, 'post', '/api/fees/generate', { school_id: schoolId, academic_year: AY })).status)
    const led = await db.query(`SELECT id, student_id FROM student_fee_ledger WHERE school_id = $1 AND academic_year = $2`, [schoolId, AY])
    const ashaLedger = led.rows.find(r => r.student_id === ashaId).id
    const balaLedger = led.rows.find(r => r.student_id === balaId).id
    await db.query(`UPDATE student_fee_ledger SET amount_paid = 2000, status = 'partial' WHERE id = $1`, [ashaLedger])
    await db.query(`INSERT INTO fee_payments (school_id, student_id, ledger_id, amount, payment_mode, receipt_number, paid_date, collected_by_name) VALUES ($1,$2,$3,2000,'upi',$4,$5,'Front Desk')`, [schoolId, ashaId, ashaLedger, `R-${ts}`, today])
    await db.query(`UPDATE student_fee_ledger SET waiver_amount = 500 WHERE id = $1`, [balaLedger])
    await db.query(`INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_value, waiver_amount, reason, granted_by_name) VALUES ($1,$2,$3,'fixed_amount',500,500,'Sibling discount','Export Principal')`, [schoolId, balaId, balaLedger])

    // Expenses, calendar, syllabus, class history, announcement
    const ec = await db.query(`INSERT INTO expense_categories (school_id, name) VALUES ($1,'Stationery') RETURNING id`, [schoolId])
    await db.query(`INSERT INTO expenses (school_id, category_id, title, payee_name, amount, expense_date, payment_mode, voucher_number) VALUES ($1,$2,'Chalk and registers','Local Store',1250,$3,'cash',$4)`, [schoolId, ec.rows[0].id, today, `V-${ts}`])
    await db.query(`INSERT INTO school_calendar (school_id, title, event_date, event_type) VALUES ($1,'Founders Day',$2,'holiday')`, [schoolId, today])
    const ss = await db.query(`INSERT INTO school_subjects (school_id, subject_name, grade, academic_year) VALUES ($1,'Maths','10',$2) RETURNING id`, [schoolId, AY])
    const ch = await db.query(`INSERT INTO school_chapters (school_subject_id, chapter_name) VALUES ($1,'Algebra') RETURNING id`, [ss.rows[0].id])
    const topics = [await db.query(`INSERT INTO school_topics (school_chapter_id, topic_name) VALUES ($1,'Equations') RETURNING id`, [ch.rows[0].id]), await db.query(`INSERT INTO school_topics (school_chapter_id, topic_name) VALUES ($1,'Graphs') RETURNING id`, [ch.rows[0].id])]
    await db.query(`INSERT INTO school_topic_progress (class_id, school_topic_id, status) VALUES ($1,$2,'covered')`, [classA, topics[0].rows[0].id])
    const ay = await db.query(`SELECT id FROM academic_years WHERE school_id = $1 LIMIT 1`, [schoolId])
    await db.query(`INSERT INTO student_class_history (student_id, school_id, academic_year_id, grade, section, promoted_to_grade, outcome) VALUES ($1,$2,$3,'9','A','10','promoted')`, [ashaId, schoolId, ay.rows[0].id])
    expect((await call(admin, 'post', '/api/announcements', { school_id: schoolId, title: 'Holiday notice', content: 'Closed', target_audience: 'parents' })).status).toBe(201)
  })

  test.afterAll(async () => {
    for (const id of [schoolId, otherId]) if (id) await fetch(`${BASE}/api/schools/${id}`, { method: 'DELETE', headers: { Cookie: platform } }).catch(() => {})
    await db?.end()
  })

  test('1. The catalog lists every export for the modules the school has — grouped, with filters', async () => {
    const r = await call(admin, 'get', `/api/data-export/catalog?school_id=${schoolId}`)
    expect(r.status).toBe(200)
    const keys = (r.body.exports as { key: string }[]).map(e => e.key)
    for (const k of ['students', 'class-roll-list', 'parents', 'teachers', 'classes', 'class-subjects', 'exam-schedule', 'exam-results', 'syllabus-progress', 'class-history',
      'attendance-register', 'absentees', 'attendance-summary', 'low-attendance', 'fee-structure', 'fee-ledger', 'fee-defaulters', 'fee-payments', 'fee-day-collection', 'fee-waivers',
      'expenses', 'expense-summary', 'holidays', 'announcements', 'full-backup']) expect(keys, k).toContain(k)
    expect((r.body.groups as { key: string }[]).map(g => g.key)).toEqual(expect.arrayContaining(['people', 'academics', 'attendance', 'fees', 'expenses', 'other', 'backup']))
    expect(r.body.options.classes.map((c: { label: string }) => c.label)).toEqual(['Grade 9-B', 'Grade 10-A'])
    expect(r.body.options.exams[0].label).toContain('Unit Test 1')
    expect(r.body.options.currentYear).toBe(AY)
    const students = (r.body.exports as any[]).find(e => e.key === 'students')
    expect(students.filters.find((f: any) => f.key === 'section').options.map((o: any) => o.value)).toEqual(['', 'A', 'B'])
  })

  test('2. A school without the modules only sees what its plan includes, and cannot download the rest', async () => {
    const r = await call(adminOther, 'get', `/api/data-export/catalog?school_id=${otherId}`)
    expect(r.status).toBe(200)
    expect((r.body.exports as { key: string }[]).map(e => e.key)).toEqual(['full-backup'])
    expect((await dl(adminOther, 'fee-ledger', '', otherId)).status).toBe(403)
    expect((await dl(adminOther, 'students', '', otherId)).status).toBe(403)
  })

  test('3. Student list: filters, formula safety and the BOM', async () => {
    const all = await dl(admin, 'students', '&status=all')
    expect(all.status).toBe(200)
    expect(all.headers.get('content-type')).toContain('text/csv')
    expect(all.headers.get('content-disposition')).toContain('.csv')
    expect(all.buf.subarray(0, 3).toString('hex')).toBe('efbbbf')                                   // BOM for Excel / Telugu names
    const active = csvRows((await dl(admin, 'students')).buf).join('\n')                            // default = active
    expect(active).toContain('Asha Rao'); expect(active).not.toContain('Old Student')
    expect(csvRows((await dl(admin, 'students', '&status=graduated')).buf).join('\n')).toContain('Old Student')
    expect(csvRows((await dl(admin, 'students', '&grade=9')).buf).join('\n')).not.toContain('Asha Rao')
    expect(csvRows((await dl(admin, 'students', '&grade=10&section=A')).buf).join('\n')).toContain('Bala Krishna')
    // a name that starts with = is neutralised so Excel does not run it
    expect(all.buf.toString('utf8')).toContain(`"'=HYPERLINK(`)
    expect(all.buf.toString('utf8')).not.toContain(`,"=HYPERLINK(`)
  })

  test('4. Excel format: a real workbook with a header row and numeric cells', async () => {
    const r = await dl(admin, 'students', '&format=xlsx')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('spreadsheetml')
    const ws = (await readSheets(r.buf)).getWorksheet('Students')!
    const rows = sheetRows(ws)
    expect(rows[0]).toContain('Parent phone')
    expect(rows.map(x => x.join('|')).join('\n')).toContain('Asha Rao')
    const fee = await readSheets((await dl(admin, 'fee-ledger', `&format=xlsx&academic_year=${AY}&grade=10`)).buf)
    const amountCol = sheetRows(fee.worksheets[0])[0].indexOf('Amount due') + 1
    expect(typeof fee.worksheets[0].getRow(2).getCell(amountCol).value).toBe('number')
  })

  test('5. People: roll list, parents, staff, classes, subjects', async () => {
    const roll = csvRows((await dl(admin, 'class-roll-list', `&class_id=${classA}`)).buf)
    expect(roll[0]).toContain('Class roll list — Grade 10 Section A')
    expect(roll[2]).toContain('Asha Rao'); expect(roll[3]).toContain('Bala Krishna')                // roll-number order
    expect(roll.join('\n')).not.toContain('Old Student')                                           // graduated students are not on the roll
    expect(csvRows((await dl(admin, 'parents')).buf).join('\n')).toContain('Parent of Asha Rao')
    const staff = csvRows((await dl(admin, 'teachers')).buf).join('\n')
    expect(staff).toContain('Ms Rao'); expect(staff).toContain('10-A')                              // class teacher of 10-A
    const cls = csvRows((await dl(admin, 'classes')).buf).join('\n')
    expect(cls).toContain('"10","A","Ms Rao","2"')                                                  // Asha + Bala (Old Student graduated)
  })

  test('6. Exam results: every subject, total, percentage, pass / fail', async () => {
    const rows = csvRows((await dl(admin, 'exam-results', `&exam_id=${examId}`)).buf)
    expect(rows[0]).toContain('Unit Test 1'); expect(rows[0]).toContain('pass mark 35%')
    expect(rows[1]).toContain('Maths (max 50)'); expect(rows[1]).toContain('Total (max 100)')
    const asha = rows.find(r => r.includes('Asha Rao'))!, bala = rows.find(r => r.includes('Bala Krishna'))!
    expect(asha).toContain('"40","30","70","70","PASS"')
    expect(bala).toContain('"10","12","22","22","FAIL"')
    const sched = csvRows((await dl(admin, 'exam-schedule')).buf).join('\n')
    expect(sched).toContain('Unit Test 1'); expect(sched).toContain('Maths (50)')
    expect(csvRows((await dl(admin, 'syllabus-progress')).buf).join('\n')).toContain('"10","A","Maths","1","2","1","50"')
    expect(csvRows((await dl(admin, 'class-history')).buf).join('\n')).toContain('Asha Rao')
  })

  test('7. Attendance: register, absentees, monthly summary, low-attendance — with the shared rules', async () => {
    const reg = csvRows((await dl(admin, 'attendance-register', `&class_id=${classA}&from=${monthFrom}&to=${monthTo}`)).buf).join('\n')
    expect(reg).toContain('Asha Rao'); expect(reg).toContain('absent')
    const abs = csvRows((await dl(admin, 'absentees', `&date=${att1}`)).buf).join('\n')
    expect(abs).toContain('Bala Krishna'); expect(abs).toContain('Morning + Afternoon'); expect(abs).toContain('Parent of Bala Krishna'); expect(abs).not.toContain('Asha Rao')
    const sum = csvRows((await dl(admin, 'attendance-summary', `&class_id=${classA}&month=${monthStr}`)).buf)
    expect(sum.find(r => r.includes('Asha Rao'))).toContain('"8","0","0","8","100"')
    expect(sum.find(r => r.includes('Bala Krishna'))).toContain('"6","0","2","8","75"')
    const low = csvRows((await dl(admin, 'low-attendance', `&from=${monthFrom}&to=${monthTo}&threshold=85`)).buf).join('\n')
    expect(low).toContain('Bala Krishna'); expect(low).not.toContain('Asha Rao')
    expect(csvRows((await dl(admin, 'low-attendance', `&from=${monthFrom}&to=${monthTo}&threshold=60`)).buf).join('\n')).not.toContain('Bala Krishna')
  })

  test('8. Fees: structure, ledger, defaulters, payments, day collection, waivers', async () => {
    expect(csvRows((await dl(admin, 'fee-structure', `&academic_year=${AY}`)).buf).join('\n')).toContain('"Tuition","annual","10","5000"')
    const led = csvRows((await dl(admin, 'fee-ledger', `&academic_year=${AY}&status=outstanding`)).buf).join('\n')
    expect(led).toContain('Asha Rao'); expect(led).toContain('Bala Krishna')
    const def = csvRows((await dl(admin, 'fee-defaulters', `&academic_year=${AY}`)).buf)
    expect(def[0]).toContain('total balance 7500')                                                  // Asha 3000 + Bala 4500
    expect(def.find(r => r.includes('Bala Krishna'))).toContain('"5000","0","500","4500"')
    expect(def.find(r => r.includes('Asha Rao'))).toContain('"5000","2000","0","3000"')
    expect(csvRows((await dl(admin, 'fee-payments', `&academic_year=${AY}`)).buf).join('\n')).toContain(`R-${ts}`)
    const day = csvRows((await dl(admin, 'fee-day-collection', `&date=${today}`)).buf)
    expect(day.join('\n')).toContain('"upi","1","2000"'); expect(day[day.length - 1]).toContain('"TOTAL","1","2000"')
    expect(csvRows((await dl(admin, 'fee-waivers')).buf).join('\n')).toContain('Sibling discount')
  })

  test('9. Expenses, calendar and announcement history', async () => {
    expect(csvRows((await dl(admin, 'expenses', `&from=${monthStart()}&to=${today}`)).buf).join('\n')).toContain('Chalk and registers')
    const sum = csvRows((await dl(admin, 'expense-summary', `&from=${monthStart()}&to=${today}`)).buf).join('\n')
    expect(sum).toContain('"Stationery","1","1250","100"'); expect(sum).toContain('"TOTAL"')
    expect(csvRows((await dl(admin, 'holidays')).buf).join('\n')).toContain('Founders Day')
    const ann = csvRows((await dl(admin, 'announcements')).buf).join('\n')
    expect(ann).toContain('Holiday notice'); expect(ann).toContain(`Export Principal ${ts}`)
    function monthStart() { return `${today.slice(0, 7)}-01` }
  })

  test('10. Full backup: one workbook with a sheet per module, including graduated students', async () => {
    const r = await dl(admin, 'full-backup', '&format=xlsx')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toContain('school_backup_')
    const wb = await readSheets(r.buf)
    const names = wb.worksheets.map(w => w.name)
    for (const n of ['Student list', 'Parent contact list', 'Staff list', 'Classes', 'Fee ledger', 'Expense register', 'Holidays & events']) expect(names, n).toContain(n)
    expect(sheetRows(wb.getWorksheet('Student list')!).map(r => r.join('|')).join('\n')).toContain('Old Student')
    expect((await dl(admin, 'full-backup', '&format=csv')).status).toBe(400)                        // backup is a workbook
  })

  test('11. Bad filters are refused with a clear message; other schools\' classes are not found', async () => {
    const json = async (p: Promise<{ text: () => Promise<string>; status: number }>) => { const r = await p; return { status: r.status, body: JSON.parse(await r.text()) } }
    expect((await json(dl(admin, 'attendance-summary', `&month=${monthStr}`))).status).toBe(400)   // class missing
    expect((await json(dl(admin, 'attendance-register', `&class_id=${classA}&from=2026-13-40&to=${today}`))).status).toBe(400)
    expect((await json(dl(admin, 'attendance-register', `&class_id=${classA}&from=2020-01-01&to=${today}`))).body.error).toContain('at most 366 days')
    expect((await json(dl(admin, 'fee-defaulters'))).body.error).toContain('Academic year is required')
    expect((await json(dl(admin, 'fee-ledger', '&academic_year=nope'))).status).toBe(400)
    expect((await json(dl(admin, 'fee-ledger', `&academic_year=${AY}&status=weird`))).status).toBe(400)
    expect((await json(dl(admin, 'students', '&status=weird'))).status).toBe(400)
    expect((await json(dl(admin, 'no-such-export'))).status).toBe(404)
    expect((await json(dl(admin, 'students', '&format=pdf'))).status).toBe(400)
    expect((await json(dl(admin, 'class-roll-list', '&class_id=999999999'))).status).toBe(404)
    const otherClass = (await db.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1,'5','Z') RETURNING id`, [otherId])).rows[0].id
    expect((await json(dl(admin, 'class-roll-list', `&class_id=${otherClass}`))).status).toBe(404)
    expect((await json(dl(admin, 'absentees', `&date=${att1}&class_id=${otherClass}`))).status).toBe(404)
    expect((await json(dl(admin, 'exam-results', '&exam_id=999999999'))).status).toBe(404)
  })

  test('12. Only this school\'s admin can export; teachers and outsiders cannot', async () => {
    expect((await dl(anon, 'students')).status).toBe(403)
    expect((await dl(teacher, 'students')).status).toBe(403)
    expect((await dl(adminOther, 'students')).status).toBe(403)                                     // other school's admin asking for school A
    expect((await call(anon, 'get', `/api/data-export/catalog?school_id=${schoolId}`)).status).toBe(403)
    expect((await call(teacher, 'get', `/api/data-export/catalog?school_id=${schoolId}`)).status).toBe(403)
    expect((await call(adminOther, 'get', `/api/data-export/catalog?school_id=${schoolId}`)).status).toBe(403)
    expect((await call(anon, 'get', `/api/data-export/log?school_id=${schoolId}`)).status).toBe(403)
    expect((await call(adminOther, 'get', `/api/data-export/log?school_id=${schoolId}`)).status).toBe(403)
  })

  test('13. Every download is logged: who, what, filters, rows', async () => {
    const log = (await call(admin, 'get', `/api/data-export/log?school_id=${schoolId}`)).body as Array<{ export_key: string; format: string; by_name: string; row_count: number; filters: Record<string, string> }>
    expect(log.length).toBeGreaterThan(10)
    const bala = log.find(l => l.export_key === 'attendance-summary')!
    expect(bala).toMatchObject({ format: 'csv', by_name: `Export Principal ${ts}` })
    expect(bala.filters.month).toBe(monthStr); expect(bala.row_count).toBe(2)
    expect(log.some(l => l.export_key === 'full-backup' && l.format === 'xlsx')).toBe(true)
    expect(log.some(l => l.export_key === 'students' && l.format === 'csv')).toBe(true)
    // refused requests are not logged
    expect(log.some(l => l.export_key === 'no-such-export')).toBe(false)
    expect((await call(adminOther, 'get', `/api/data-export/log?school_id=${otherId}`)).body).toEqual([])
  })

  test('14. UI: browse by group, search, set filters and download; the log tab shows it', async ({ browser }) => {
    test.setTimeout(150000)
    const ctx = await browser.newContext({ acceptDownloads: true })
    await ctx.addCookies((await admin.storageState()).cookies.map(c => ({ name: c.name, value: c.value, url: BASE })))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/school-admin`)
    await page.getByText('Export Data', { exact: true }).first().click({ timeout: 90000 })
    await expect(page.getByTestId('export-group-fees')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('export-group-fees').click()
    await expect(page.getByTestId('export-card-fee-defaulters')).toBeVisible()
    await expect(page.getByTestId('export-card-students')).toHaveCount(0)
    await page.getByTestId('export-group-all').click()
    await page.getByTestId('export-search').fill('roll list')
    await expect(page.getByTestId('export-card-class-roll-list')).toBeVisible()
    await expect(page.getByTestId('export-card-fee-ledger')).toHaveCount(0)

    // needs a class: refuses until one is chosen, then downloads
    await page.getByTestId('export-open-class-roll-list').click()
    await page.getByTestId('export-download-class-roll-list').click()
    await expect(page.getByTestId('export-error-class-roll-list')).toContainText('Class is required')
    await page.getByTestId('export-filter-class-roll-list-class_id').selectOption(String(classA))
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download-class-roll-list').click()])
    expect(download.suggestedFilename()).toBe(`roll_list_${classA}.xlsx`)   // Excel is the default when offered

    // CSV from the format toggle
    await page.getByTestId('export-search').fill('student list')
    await page.getByTestId('export-open-students').click()
    await page.getByTestId('export-format-students-csv').click()
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download-students').click()])
    expect(csv.suggestedFilename()).toBe('students_active.csv')

    await page.getByTestId('export-tab-log').click()
    await expect(page.getByTestId('export-log-row').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('export-log').getByText('Class roll list').first()).toBeVisible()
    await ctx.close()
  })
})
