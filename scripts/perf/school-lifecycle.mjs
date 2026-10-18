// Timed end-to-end "school lifecycle" against a deployed copy of the app (#381).
//
// Phase A builds a school from scratch (platform admin -> school -> classes -> teachers ->
// students -> attendance) and times every request. Phase B times the read paths of an
// existing school, and Phase C a teacher's dashboard. Read paths run 3x (min/median/max).
//
// Fake phones (90000xxxxx) are only safe while WhatsApp is unconfigured on the target — delete
// the PerfTest schools afterwards. No real email goes out: every address is Resend's sink (delivered+...@resend.dev) and
// students/parents get no email or phone. The new school admin's password is set straight
// in the DB (same shortcut as e2e/fixtures/platform-admin.ts) because the onboarding link
// only goes by email — so DATABASE_URL must point at the same (dev) DB as BASE_URL.
//
//   BASE_URL=https://wlyl.<sub>.workers.dev DATABASE_URL=... \
//   PLATFORM_EMAIL=... PLATFORM_PASSWORD=... EXISTING_ADMIN_EMAIL=... EXISTING_ADMIN_PASSWORD=... \
//   TEACHER_EMAIL=... TEACHER_PASSWORD=... [STUDENTS=300 TEACHERS=15 CLASSES=10 OUT=./perf-report] \
//   node scripts/perf/school-lifecycle.mjs
import { writeFileSync } from 'node:fs'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const env = process.env
const BASE = env.BASE_URL?.replace(/\/$/, '')
if (!BASE) throw new Error('BASE_URL is required')
if (/welearnyoulearn\.com/.test(BASE) && env.ALLOW_PROD !== '1') throw new Error('Refusing to run against production')
const STUDENTS = Number(env.STUDENTS || 300)
const TEACHERS = Number(env.TEACHERS || 15)
const CLASSES = Number(env.CLASSES || 10)
const OUT = env.OUT || './perf-report'
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10) // IST date

const results = []
// Names may only hold letters, spaces and ' . - (route validation), so number them in letters.
const letters = n => { let s = ''; n += 1; while (n > 0) { s = String.fromCharCode(97 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26) } return s[0].toUpperCase() + s.slice(1) }
const rowsOf = d => Array.isArray(d) ? d : d?.students ?? d?.data ?? []

function actor(name) { return { name, cookies: new Map() } }

async function call(a, phase, step, method, path, body, { quiet = false } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (a.cookies.size) headers.cookie = [...a.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const t0 = performance.now()
  let status = 0, data = null, text = ''
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' })
    status = res.status
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=')
      a.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
    }
    text = await res.text()
    try { data = JSON.parse(text) } catch { data = null }
  } catch (e) { text = String(e) }
  const ms = Math.round(performance.now() - t0)
  const ok = status >= 200 && status < 300
  const note = ok ? describe(data) : text.slice(0, 160).replace(/\s+/g, ' ')
  const r = { phase, step, method, path: path.replace(/(password|token)=[^&]*/gi, '$1=…'), status, ms, ok, note }
  results.push(r)
  if (!quiet) console.log(`${ok ? '✓' : '✗'} [${phase}] ${step.padEnd(34)} ${String(status).padEnd(4)} ${String(ms).padStart(6)} ms  ${note}`)
  return { ok, status, data, ms }
}

function describe(d) {
  if (Array.isArray(d)) return `${d.length} rows`
  if (d && typeof d === 'object') {
    for (const k of ['students', 'teachers', 'rows', 'data', 'items', 'classes', 'ledger']) if (Array.isArray(d[k])) return `${d[k].length} ${k}`
    if (typeof d.total === 'number') return `total ${d.total}`
  }
  return ''
}

// Each read path 3x — the first call on a fresh Worker isolate is a cold start.
async function reads(a, phase, paths) {
  for (const [step, path] of paths) for (let i = 1; i <= 3; i++) await call(a, phase, `${step} #${i}`, 'GET', path, undefined, { quiet: i > 1 })
}

async function login(a, phase, path, email, password) {
  return call(a, phase, `${a.name} login`, 'POST', path, { email, password })
}

function readPaths(schoolId, year, studentId) {
  const y = encodeURIComponent(year ?? '')
  const p = [
    ['auth/me', '/api/auth/me'],
    ['school', `/api/schools/${schoolId}`],
    ['subscription', `/api/schools/${schoolId}/subscription`],
    ['academic-year/current', `/api/academic-year/current?school_id=${schoolId}`],
    ['enabled-features', `/api/school/enabled-features?school_id=${schoolId}&portal=school-admin`],
    ['dashboard overview', `/api/admin/overview?school_id=${schoolId}&features=attendance,exams,fees&date=${TODAY}&year=${y}`],
    ['students summary', `/api/students?school_id=${schoolId}&summary=1`],
    ['students page 1 (50)', `/api/students?school_id=${schoolId}&limit=50&offset=0&status=active`],
    ['staff list', `/api/teachers?school_id=${schoolId}`],
    ['classes list', `/api/classes?school_id=${schoolId}`],
    ['attendance school/day', `/api/attendance?view=school&date=${TODAY}`],
    ['fees stats', `/api/fees/stats?school_id=${schoolId}&academic_year=${y}`],
    ['fees setup-status', `/api/fees/setup-status?school_id=${schoolId}&academic_year=${y}`],
    ['fees payments (year)', `/api/fees/payments?school_id=${schoolId}&academic_year=${y}`],
  ]
  if (studentId) p.push(['student profile', `/api/students/${studentId}/profile`])
  return p
}

const yearOf = d => d?.label ?? d?.academic_year ?? d?.year ?? d?.current?.label ?? null

// ── Phase A: build a school ────────────────────────────────────────────────────────────────
async function phaseA() {
  const P = 'A new school'
  const platform = actor('platform')
  if (!(await login(platform, P, '/api/auth/login', env.PLATFORM_EMAIL, env.PLATFORM_PASSWORD)).ok) return
  const adminEmail = `delivered+perf-${TS}-admin@resend.dev`
  const created = await call(platform, P, 'create school', 'POST', '/api/schools', {
    name: `PerfTest ${TS}`, type: 'Private', city: 'Hyderabad', country: 'India', email: adminEmail, address: 'Perf test',
  })
  if (!created.ok) return
  const schoolId = created.data.id
  await call(platform, P, 'set plan premium', 'PUT', `/api/schools/${schoolId}/subscription`, { tier: 'premium' })

  // Harness step (not timed against the app): give the new admin a known password.
  const password = `Perf!${Math.random().toString(36).slice(2)}aA1`
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
  await pool.query(`UPDATE users SET password_hash=$1, first_login=FALSE, profile_completed=TRUE WHERE school_id=$2 AND role='school_admin'`,
    [await bcrypt.hash(password, 12), schoolId])
  await pool.end()

  const admin = actor('school admin')
  if (!(await login(admin, P, '/api/auth/login', adminEmail, password)).ok) return
  const yr = yearOf((await call(admin, P, 'academic-year/current', 'GET', `/api/academic-year/current?school_id=${schoolId}`)).data)

  let t = performance.now()
  for (let g = 1; g <= CLASSES; g++) await call(admin, P, `create class ${g}-A`, 'POST', '/api/classes', { school_id: schoolId, grade: String(g), section: 'A' }, { quiet: g > 1 })
  results.push({ phase: P, step: `TOTAL create ${CLASSES} classes`, ms: Math.round(performance.now() - t), ok: true, total: true })
  const classes = (await call(admin, P, 'classes list', 'GET', `/api/classes?school_id=${schoolId}`)).data
  const classList = Array.isArray(classes) ? classes : classes?.classes ?? []

  const teachers = Array.from({ length: TEACHERS }, (_, i) => ({
    name: `Perf Teacher ${letters(i)}`, email: `delivered+perf-${TS}-t${i + 1}@resend.dev`,
    phone: String(9000000000 + i), subject: ['Mathematics', 'English', 'Hindi', 'Physics', 'Telugu'][i % 5], department: 'Academics', staff_type: 'teaching',
  }))
  const tb = await call(admin, P, `bulk add ${TEACHERS} teachers`, 'POST', '/api/teachers/bulk', { school_id: schoolId, teachers })
  const teacherIds = (tb.data?.teachers ?? []).map(x => x.id)

  t = performance.now()
  for (const [i, c] of classList.slice(0, teacherIds.length).entries()) {
    await call(admin, P, `assign class teacher ${c.grade}-${c.section}`, 'PUT', `/api/classes/${c.id}`, { class_teacher_id: teacherIds[i] }, { quiet: i > 0 })
  }
  results.push({ phase: P, step: `TOTAL assign ${Math.min(classList.length, teacherIds.length)} class teachers`, ms: Math.round(performance.now() - t), ok: true, total: true })

  const students = Array.from({ length: STUDENTS }, (_, i) => ({ name: `Perf Student ${letters(i)}`, grade: String((i % CLASSES) + 1), section: 'A', school_roll_number: Math.floor(i / CLASSES) + 1, parent_name: `Perf Parent ${letters(i)}`, parent_phone: String(9000010000 + i) }))
  await call(admin, P, `bulk add ${STUDENTS} students (1 upload)`, 'POST', '/api/students/bulk', { school_id: schoolId, students })

  // Attendance: load each class's mark sheet the way the UI does, then mark everyone present.
  t = performance.now()
  for (const c of classList) {
    const sheet = await call(admin, P, `attendance sheet ${c.grade}-${c.section}`, 'GET', `/api/students?school_id=${schoolId}&grade=${c.grade}&section=${c.section}`, undefined, { quiet: c !== classList[0] })
    const list = rowsOf(sheet.data)
    if (!list.length) continue
    await call(admin, P, `mark attendance ${c.grade}-${c.section} (${list.length})`, 'POST', '/api/attendance', {
      class_id: c.id, date: TODAY, session: 'morning', records: list.map(s => ({ student_id: s.id, status: 'present' })),
    }, { quiet: c !== classList[0] })
  }
  results.push({ phase: P, step: `TOTAL attendance, ${classList.length} classes`, ms: Math.round(performance.now() - t), ok: true, total: true })

  const page1 = (await call(admin, P, 'students page 1', 'GET', `/api/students?school_id=${schoolId}&limit=50&offset=0&status=active`)).data
  const firstId = rowsOf(page1)[0]?.id
  await reads(admin, P, readPaths(schoolId, yr, firstId))
  console.log(`\nPhase A school id ${schoolId} (PerfTest ${TS})`)
  return schoolId
}

// ── Phase B: an existing school ────────────────────────────────────────────────────────────
async function phaseB() {
  const P = 'B existing school'
  const admin = actor('existing admin')
  const l = await login(admin, P, '/api/auth/login', env.EXISTING_ADMIN_EMAIL, env.EXISTING_ADMIN_PASSWORD)
  if (!l.ok) return
  const me = (await call(admin, P, 'auth/me', 'GET', '/api/auth/me')).data
  const schoolId = me?.school_id ?? me?.user?.school_id ?? l.data?.schoolId
  const yr = yearOf((await call(admin, P, 'academic-year/current', 'GET', `/api/academic-year/current?school_id=${schoolId}`)).data)
  const page1 = (await call(admin, P, 'students page 1', 'GET', `/api/students?school_id=${schoolId}&limit=50&offset=0&status=active`)).data
  const firstId = rowsOf(page1)[0]?.id
  await reads(admin, P, readPaths(schoolId, yr, firstId))
}

// ── Phase C: teacher ───────────────────────────────────────────────────────────────────────
async function phaseC() {
  const P = 'C teacher'
  const teacher = actor('teacher')
  const l = await login(teacher, P, '/api/teacher/auth/login', env.TEACHER_EMAIL, env.TEACHER_PASSWORD)
  if (!l.ok) return
  const me = (await call(teacher, P, 'teacher/auth/me', 'GET', '/api/teacher/auth/me')).data
  const t = me?.teacher ?? me
  const schoolId = t?.school_id ?? t?.schoolId
  await reads(teacher, P, [
    ['teacher/auth/me', '/api/teacher/auth/me'],
    ['classes', `/api/classes?school_id=${schoolId}`],
    ['class-subjects', `/api/teachers/${t?.id}/class-subjects`],
    ['exams', `/api/exams?school_id=${schoolId}`],
  ])
}

function stats(xs) { const s = [...xs].sort((a, b) => a - b); return { min: s[0], med: s[Math.floor(s.length / 2)], max: s.at(-1) } }

function report() {
  const lines = [`# WLYL performance run — ${BASE}`, '', `Run ${new Date().toISOString()} · ${STUDENTS} students, ${TEACHERS} teachers, ${CLASSES} classes`, '']
  for (const phase of [...new Set(results.map(r => r.phase))]) {
    lines.push(`## ${phase}`, '', '| Step | Status | ms (min / median / max) | Note |', '|---|---|---|---|')
    const groups = new Map()
    for (const r of results.filter(r => r.phase === phase)) {
      const key = r.step.replace(/ #\d$/, '')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(r)
    }
    for (const [step, rs] of groups) {
      const s = stats(rs.map(r => r.ms))
      const timing = rs.length > 1 ? `${s.min} / ${s.med} / ${s.max}` : `${s.min}`
      const bad = rs.find(r => !r.ok)
      lines.push(`| ${step} | ${rs[0].total ? '' : bad ? `✗ ${bad.status}` : `✓ ${rs[0].status}`} | ${timing} | ${(bad ?? rs[0]).note ?? ''} |`)
    }
    lines.push('')
  }
  lines.push('## 5 slowest requests', '', '| Phase | Step | ms |', '|---|---|---|')
  for (const r of results.filter(r => !r.total).sort((a, b) => b.ms - a.ms).slice(0, 5)) lines.push(`| ${r.phase} | ${r.step} | ${r.ms} |`)
  writeFileSync(`${OUT}.json`, JSON.stringify(results, null, 1))
  writeFileSync(`${OUT}.md`, lines.join('\n') + '\n')
  console.log(`\nWrote ${OUT}.md and ${OUT}.json`)
}

try {
  if (env.SKIP_A !== '1') await phaseA()
  if (env.EXISTING_ADMIN_EMAIL) await phaseB()
  if (env.TEACHER_EMAIL) await phaseC()
} finally {
  report()
}
