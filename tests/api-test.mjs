/**
 * WLYL Prototype — Automated API Test Suite
 * Run: node tests/api-test.mjs
 * Requires: dev server running on localhost:3000
 */

const BASE = 'http://localhost:3000'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0, failed = 0
const issues = []
const cleanup = { schoolId: null, teacherIds: [], studentIds: [], classIds: [], leaveIds: [] }

function log(label, ok, detail = '') {
  const icon = ok ? '✓' : '✗'
  const color = ok ? '\x1b[32m' : '\x1b[31m'
  console.log(`${color}${icon}\x1b[0m ${label}${detail ? ' — ' + detail : ''}`)
  if (ok) passed++
  else { failed++; issues.push({ label, detail }) }
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  try {
    const r = await fetch(`${BASE}${path}`, opts)
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: r.status, data }
  } catch (e) {
    return { status: 0, data: null, error: e.message }
  }
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dayName(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

// ─── 1. School Creation (Platform Admin) ─────────────────────────────────────

async function testSchoolCreation() {
  console.log('\n\x1b[1m── 1. School Creation ──\x1b[0m')

  const r = await api('POST', '/api/schools', {
    name: '__TEST__ Springfield Academy',
    type: 'CBSE',
    city: 'Springfield',
    country: 'India',
  })
  log('POST /api/schools — create school', r.status === 201 && r.data?.id, `status=${r.status}`)
  if (!r.data?.id) return

  cleanup.schoolId = r.data.id
  const sid = r.data.id

  // Read back
  const r2 = await api('GET', `/api/schools/${sid}`)
  log('GET /api/schools/:id — fetch school', r2.data?.id === sid)

  // List all schools
  const r3 = await api('GET', '/api/schools')
  log('GET /api/schools — list includes new school',
    Array.isArray(r3.data) && r3.data.some(s => s.id === sid))

  // Update school
  const r4 = await api('PUT', `/api/schools/${sid}`, { name: '__TEST__ Springfield Academy Updated', status: 'active' })
  log('PUT /api/schools/:id — update school', r4.status === 200 && r4.data?.name?.includes('Updated'))

  // Subscription
  const r5 = await api('POST', `/api/schools/${sid}/subscription`, {
    plan_type: 'premium', plan_start_date: today(), plan_end_date: '2027-03-22', plan_amount: 9999
  })
  log('POST /api/schools/:id/subscription — set subscription', r5.status === 200 || r5.status === 201)
}

// ─── 2. Teacher Management ────────────────────────────────────────────────────

async function testTeacherManagement() {
  console.log('\n\x1b[1m── 2. Teacher Management ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid) { log('Teacher tests skipped — no school', false, 'school creation failed'); return }

  // Create teachers
  const teachers = [
    { name: '__TEST__ Alice Kumar',  employee_id: 'T001', subject: 'Mathematics', department: 'Science',  staff_type: 'teaching', email: 'alice@test.com' },
    { name: '__TEST__ Bob Sharma',   employee_id: 'T002', subject: 'Physics',     department: 'Science',  staff_type: 'teaching', email: 'bob@test.com' },
    { name: '__TEST__ Carol Nair',   employee_id: 'T003', subject: 'English',     department: 'Language', staff_type: 'teaching', email: 'carol@test.com' },
    { name: '__TEST__ David Raj',    employee_id: 'T004', subject: 'History',     department: 'Social',   staff_type: 'teaching', email: 'david@test.com' },
    { name: '__TEST__ Eve Menon',    employee_id: 'T005', subject: 'Biology',     department: 'Science',  staff_type: 'teaching', email: 'eve@test.com' },
    { name: '__TEST__ Frank George', employee_id: 'T006', subject: 'Hindi',       department: 'Language', staff_type: 'teaching', email: 'frank@test.com' },
  ]

  for (const t of teachers) {
    const r = await api('POST', '/api/teachers', { ...t, school_id: sid })
    log(`POST /api/teachers — create ${t.name.replace('__TEST__ ','')}`, r.status === 201 && r.data?.id, `status=${r.status}`)
    if (r.data?.id) cleanup.teacherIds.push(r.data.id)
  }

  log('Created 6 teachers', cleanup.teacherIds.length === 6, `got ${cleanup.teacherIds.length}`)

  // List
  const r2 = await api('GET', `/api/teachers?school_id=${sid}`)
  log('GET /api/teachers?school_id — lists all teachers',
    Array.isArray(r2.data) && r2.data.filter(t => t.name.startsWith('__TEST__')).length >= 6)

  // Fetch one by ID
  const r3 = await api('GET', `/api/teachers/${cleanup.teacherIds[0]}`)
  log('GET /api/teachers/:id — fetch single teacher', r3.data?.id === cleanup.teacherIds[0])

  // Update teacher
  const r4 = await api('PUT', `/api/teachers/${cleanup.teacherIds[0]}`, {
    name: '__TEST__ Alice Kumar', employee_id: 'T001', subject: 'Mathematics',
    department: 'Science', qualification: 'M.Sc', school_id: sid,
    class_teacher_grade: '9', class_teacher_section: 'A',
  })
  log('PUT /api/teachers/:id — update (set class teacher)', r4.status === 200)

  // Availability
  const r5 = await api('POST', '/api/teacher-availability', {
    teacher_id: cleanup.teacherIds[0], school_id: sid, day_of_week: 'Monday', period_number: 1
  })
  log('POST /api/teacher-availability — mark unavailable slot', r5.status === 200 || r5.status === 201)

  const r6 = await api('GET', `/api/teacher-availability?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}`)
  log('GET /api/teacher-availability — fetch unavailable slots', Array.isArray(r6.data))

  const r7 = await api('DELETE', `/api/teacher-availability?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}&day_of_week=Monday&period_number=1`)
  log('DELETE /api/teacher-availability — remove unavailable slot', r7.status === 200)
}

// ─── 3. Student Management ────────────────────────────────────────────────────

async function testStudentManagement() {
  console.log('\n\x1b[1m── 3. Student Management ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid) { log('Student tests skipped', false, 'school creation failed'); return }

  const r = await api('POST', '/api/students', {
    school_id: sid, name: '__TEST__ Student One', roll_number: 'S001',
    grade: '9', section: 'A', parent_name: 'Parent One', parent_phone: '9999900001',
  })
  log('POST /api/students — create student', r.status === 201 && r.data?.id, `status=${r.status}`)
  if (r.data?.id) cleanup.studentIds.push(r.data.id)

  const r2 = await api('GET', `/api/students?school_id=${sid}`)
  log('GET /api/students?school_id — list students',
    Array.isArray(r2.data) && r2.data.some(s => s.name?.startsWith('__TEST__')))

  // Bulk import
  const r3 = await api('POST', '/api/students/bulk', {
    school_id: sid,
    students: [
      { name: '__TEST__ Student Two', roll_number: 'S002', grade: '9', section: 'A', parent_name: 'Parent Two', parent_phone: '9999900002' },
      { name: '__TEST__ Student Three', roll_number: 'S003', grade: '9', section: 'B', parent_name: 'Parent Three', parent_phone: '9999900003' },
    ]
  })
  log('POST /api/students/bulk — bulk import 2 students', r3.status === 200 || r3.status === 201)
  if (Array.isArray(r3.data?.inserted)) r3.data.inserted.forEach(s => s?.id && cleanup.studentIds.push(s.id))

  // Update
  if (cleanup.studentIds[0]) {
    const r4 = await api('PUT', `/api/students/${cleanup.studentIds[0]}`, {
      name: '__TEST__ Student One Updated', roll_number: 'S001', grade: '9', section: 'A', school_id: sid,
    })
    log('PUT /api/students/:id — update student', r4.status === 200)
  }
}

// ─── 4. Class Management ──────────────────────────────────────────────────────

async function testClassManagement() {
  console.log('\n\x1b[1m── 4. Class Management ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid) { log('Class tests skipped', false, 'school creation failed'); return }

  const classes = [
    { grade: '9', section: 'A', class_teacher_id: cleanup.teacherIds[0] || null },
    { grade: '9', section: 'B', class_teacher_id: cleanup.teacherIds[1] || null },
    { grade: '10', section: 'A', class_teacher_id: cleanup.teacherIds[2] || null },
  ]

  for (const cls of classes) {
    const r = await api('POST', '/api/classes', { school_id: sid, ...cls })
    log(`POST /api/classes — create ${cls.grade}-${cls.section}`, r.status === 201 && r.data?.id, `status=${r.status}`)
    if (r.data?.id) cleanup.classIds.push(r.data.id)
  }

  log('Created 3 classes', cleanup.classIds.length === 3, `got ${cleanup.classIds.length}`)

  const r2 = await api('GET', `/api/classes?school_id=${sid}`)
  log('GET /api/classes?school_id — list classes', Array.isArray(r2.data) && r2.data.length >= 3)

  // Update class
  if (cleanup.classIds[0]) {
    const r3 = await api('PUT', `/api/classes/${cleanup.classIds[0]}`, {
      school_id: sid, grade: '9', section: 'A',
      class_teacher_id: cleanup.teacherIds[0] || null,
    })
    log('PUT /api/classes/:id — update class', r3.status === 200)
  }

  // Subjects
  if (cleanup.classIds[0]) {
    const r4 = await api('POST', `/api/classes/${cleanup.classIds[0]}/subjects`, {
      school_id: sid,
      subjects: ['Mathematics', 'Physics', 'English', 'History', 'Biology', 'Hindi']
    })
    log('POST /api/classes/:id/subjects — assign subjects', r4.status === 200 || r4.status === 201)
  }
}

// ─── 5. Curriculum ────────────────────────────────────────────────────────────

async function testCurriculum() {
  console.log('\n\x1b[1m── 5. Curriculum ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || cleanup.classIds.length === 0) { log('Curriculum tests skipped', false); return }

  const r = await api('POST', '/api/curriculum', {
    school_id: sid,
    class_id: cleanup.classIds[0],
    subject_name: 'Mathematics',
    total_periods: 40,
  })
  log('POST /api/curriculum — add curriculum entry', r.status === 201 || r.status === 200, `status=${r.status}`)

  const r2 = await api('GET', `/api/curriculum?school_id=${sid}&class_id=${cleanup.classIds[0]}`)
  log('GET /api/curriculum?school_id&class_id — list curriculum', Array.isArray(r2.data))
}

// ─── 6. Timetable Generation ──────────────────────────────────────────────────

async function testTimetableGeneration() {
  console.log('\n\x1b[1m── 6. Timetable Generation ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || cleanup.classIds.length === 0 || cleanup.teacherIds.length === 0) {
    log('Timetable tests skipped', false); return
  }

  // Generate timetable for class 9-A
  const r = await api('POST', '/api/class-timetable/generate', {
    school_id: sid,
    class_id: cleanup.classIds[0],
    periods_per_day: 6,
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    assignments: [
      { subject_name: 'Mathematics', teacher_id: cleanup.teacherIds[0], periods_per_week: 5 },
      { subject_name: 'Physics',     teacher_id: cleanup.teacherIds[1], periods_per_week: 4 },
      { subject_name: 'English',     teacher_id: cleanup.teacherIds[2], periods_per_week: 4 },
      { subject_name: 'History',     teacher_id: cleanup.teacherIds[3], periods_per_week: 3 },
      { subject_name: 'Biology',     teacher_id: cleanup.teacherIds[4], periods_per_week: 4 },
      { subject_name: 'Hindi',       teacher_id: cleanup.teacherIds[5], periods_per_week: 4 },
    ],
    break_after_period: 3,
    break_label: 'Lunch Break',
    period_times: [
      { period: 1, time_from: '08:00', time_to: '08:45' },
      { period: 2, time_from: '08:50', time_to: '09:35' },
      { period: 3, time_from: '09:40', time_to: '10:25' },
      { period: 4, time_from: '10:45', time_to: '11:30' },
      { period: 5, time_from: '11:35', time_to: '12:20' },
      { period: 6, time_from: '12:25', time_to: '13:10' },
    ],
  })
  log('POST /api/class-timetable/generate — generate class timetable',
    r.status === 200 || r.status === 201, `status=${r.status}`)

  // Fetch class timetable
  const r2 = await api('GET', `/api/class-timetable?class_id=${cleanup.classIds[0]}&school_id=${sid}`)
  log('GET /api/class-timetable?class_id — fetch timetable slots', Array.isArray(r2.data) && r2.data.length > 0, `slots=${Array.isArray(r2.data)?r2.data.length:0}`)

  // Teacher's personal timetable
  const r3 = await api('GET', `/api/timetable?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}`)
  log('GET /api/timetable?teacher_id — fetch teacher timetable', Array.isArray(r3.data))
}

// ─── 7. Leave Requests ────────────────────────────────────────────────────────

async function testLeaveRequests() {
  console.log('\n\x1b[1m── 7. Leave Requests ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || cleanup.teacherIds.length === 0) { log('Leave tests skipped', false); return }

  const todayStr = today()

  // Submit leave
  const r = await api('POST', '/api/leave-requests', {
    school_id: sid,
    teacher_id: cleanup.teacherIds[0],
    leave_type: 'Sick Leave',
    start_date: todayStr,
    end_date: todayStr,
    reason: 'Automated test leave',
  })
  log('POST /api/leave-requests — submit leave request', r.status === 201 && r.data?.id, `status=${r.status}`)
  if (!r.data?.id) return
  const leaveId = r.data.id
  cleanup.leaveIds.push(leaveId)

  // List pending
  const r2 = await api('GET', `/api/leave-requests?school_id=${sid}&status=pending`)
  log('GET /api/leave-requests?status=pending — list pending',
    Array.isArray(r2.data) && r2.data.some(l => l.id === leaveId))

  // Get by teacher
  const r3 = await api('GET', `/api/leave-requests?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}`)
  log('GET /api/leave-requests?teacher_id — fetch teacher leaves',
    Array.isArray(r3.data) && r3.data.some(l => l.id === leaveId))

  // Active leave check (active_date filter)
  const r4 = await api('GET', `/api/leave-requests?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}&status=approved&active_date=${todayStr}`)
  log('GET /api/leave-requests?active_date — no active leave before approval (expect empty)',
    Array.isArray(r4.data) && !r4.data.some(l => l.id === leaveId))

  // Approve leave
  const r5 = await api('PUT', `/api/leave-requests/${leaveId}`, { status: 'approved' })
  log('PUT /api/leave-requests/:id — approve leave', r5.status === 200 && r5.data?.status === 'approved')

  // Confirm notification created
  const r6 = await api('GET', `/api/notifications?school_id=${sid}&teacher_id=${cleanup.teacherIds[0]}`)
  const hasApprovalNotif = Array.isArray(r6.data) && r6.data.some(n => n.type === 'leave_approved')
  log('Notification created for leave approval', hasApprovalNotif)

  // Active leave check AFTER approval
  const r7 = await api('GET', `/api/leave-requests?teacher_id=${cleanup.teacherIds[0]}&school_id=${sid}&status=approved&active_date=${todayStr}`)
  log('GET with active_date — shows approved leave on today',
    Array.isArray(r7.data) && r7.data.some(l => l.id === leaveId))

  return leaveId
}

// ─── 8. Substitutes ───────────────────────────────────────────────────────────

async function testSubstitutes(leaveId) {
  console.log('\n\x1b[1m── 8. Substitute Assignment ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || !leaveId || cleanup.classIds.length === 0) {
    log('Substitute tests skipped', false); return
  }

  const todayStr = today()
  const dayOfWeek = dayName(todayStr)

  // Get free teachers for today's day+period (should exclude teacher on leave)
  const r = await api('GET',
    `/api/substitutes?school_id=${sid}&day=${encodeURIComponent(dayOfWeek)}&period=1&exclude_teacher=${cleanup.teacherIds[0]}&date=${todayStr}`)
  const freeTeachers = Array.isArray(r.data) ? r.data : []
  log('GET /api/substitutes?day&period&date — free teachers list (excludes on-leave)',
    Array.isArray(r.data) && !freeTeachers.some(t => t.id === cleanup.teacherIds[0]),
    `${freeTeachers.length} free teachers`)

  // Assign substitute (use teacher[1] if they're free, else any free teacher)
  const substituteId = freeTeachers.find(t => t.id === cleanup.teacherIds[1])?.id
    || freeTeachers[0]?.id

  if (!substituteId) {
    log('Assign substitute — no free teacher available to assign', false, 'skipping assignment tests')
    return
  }

  const r2 = await api('POST', '/api/substitutes', {
    school_id: sid,
    leave_request_id: leaveId,
    original_teacher_id: cleanup.teacherIds[0],
    assignments: [{
      class_id: cleanup.classIds[0],
      date: todayStr,
      day_of_week: dayOfWeek,
      period_number: 1,
      subject_name: 'Mathematics',
      time_from: '08:00',
      time_to: '08:45',
      substitute_teacher_id: substituteId,
    }]
  })
  log('POST /api/substitutes — assign substitute', r2.status === 200 && r2.data?.saved > 0, `saved=${r2.data?.saved}`)

  // Verify substitute assigned notif sent to sub teacher
  const r3 = await api('GET', `/api/notifications?school_id=${sid}&teacher_id=${substituteId}`)
  const hasSubNotif = Array.isArray(r3.data) && r3.data.some(n => n.type === 'substitute_assigned')
  log('Notification sent to substitute teacher', hasSubNotif)

  // Uncovered periods check (should be 0 since we covered period 1)
  const r4 = await api('GET', `/api/substitutes?school_id=${sid}&date=${todayStr}&uncovered=true`)
  log('GET /api/substitutes?uncovered=true — fetch uncovered periods', Array.isArray(r4.data), `${Array.isArray(r4.data)?r4.data.length:0} uncovered`)

  // Fetch substitutes for the class
  const r5 = await api('GET', `/api/substitutes?school_id=${sid}&class_id=${cleanup.classIds[0]}&date=${todayStr}`)
  log('GET /api/substitutes?class_id&date — substitutes for class', Array.isArray(r5.data) && r5.data.length > 0)

  // Fetch substitutes by substitute teacher
  const r6 = await api('GET', `/api/substitutes?school_id=${sid}&substitute_teacher_id=${substituteId}&date=${todayStr}`)
  log('GET /api/substitutes?substitute_teacher_id — sub duties for teacher', Array.isArray(r6.data) && r6.data.length > 0)

  // Fetch by leave request
  const r7 = await api('GET', `/api/substitutes?school_id=${sid}&leave_request_id=${leaveId}`)
  log('GET /api/substitutes?leave_request_id — substitutes for leave', Array.isArray(r7.data) && r7.data.length > 0)

  // Reject the leave → should cascade-delete substitute assignments
  const r8 = await api('PUT', `/api/leave-requests/${leaveId}`, { status: 'rejected' })
  log('PUT /api/leave-requests/:id — reject approved leave', r8.status === 200 && r8.data?.status === 'rejected')

  const r9 = await api('GET', `/api/substitutes?school_id=${sid}&leave_request_id=${leaveId}`)
  log('Cascade delete: substitutes removed after leave rejection',
    Array.isArray(r9.data) && r9.data.length === 0, `remaining=${Array.isArray(r9.data)?r9.data.length:'?'}`)

  // Rejection notification
  const r10 = await api('GET', `/api/notifications?school_id=${sid}&teacher_id=${cleanup.teacherIds[0]}`)
  const hasRejNotif = Array.isArray(r10.data) && r10.data.some(n => n.type === 'leave_rejected')
  log('Notification sent to teacher on leave rejection', hasRejNotif)
}

// ─── 9. Attendance ────────────────────────────────────────────────────────────

async function testAttendance() {
  console.log('\n\x1b[1m── 9. Attendance ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || cleanup.classIds.length === 0 || cleanup.teacherIds.length === 0) {
    log('Attendance tests skipped', false); return
  }

  const todayStr = today()

  // Mark attendance
  const r = await api('POST', '/api/attendance', {
    school_id: sid,
    class_id: cleanup.classIds[0],
    teacher_id: cleanup.teacherIds[2],
    date: todayStr,
    records: cleanup.studentIds.slice(0, 1).map(id => ({ student_id: id, status: 'present' })),
  })
  log('POST /api/attendance — mark attendance', r.status === 200 || r.status === 201, `status=${r.status}`)

  // Fetch attendance for date
  const r2 = await api('GET', `/api/attendance?school_id=${sid}&date=${todayStr}`)
  log('GET /api/attendance?school_id&date — fetch by date', Array.isArray(r2.data))

  // Fetch by class
  const r3 = await api('GET', `/api/attendance?school_id=${sid}&class_id=${cleanup.classIds[0]}`)
  log('GET /api/attendance?class_id — fetch by class', Array.isArray(r3.data))
}

// ─── 10. Notifications ────────────────────────────────────────────────────────

async function testNotifications() {
  console.log('\n\x1b[1m── 10. Notifications ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid || cleanup.teacherIds.length === 0) { log('Notification tests skipped', false); return }

  // Create a notification manually
  const r = await api('POST', '/api/notifications', {
    school_id: sid,
    recipient_teacher_id: cleanup.teacherIds[1],
    type: 'general',
    title: 'Test Notification',
    message: 'Automated test notification',
    data: { test: true },
  })
  log('POST /api/notifications — create notification', r.status === 200 || r.status === 201, `status=${r.status}`)

  // Fetch notifications for teacher
  const r2 = await api('GET', `/api/notifications?school_id=${sid}&teacher_id=${cleanup.teacherIds[1]}`)
  log('GET /api/notifications?teacher_id — list notifications',
    Array.isArray(r2.data) && r2.data.some(n => n.title === 'Test Notification'))

  // Mark as read (check if PATCH/PUT supported)
  if (Array.isArray(r2.data) && r2.data.length > 0) {
    const nid = r2.data[0].id
    const r3 = await api('PUT', `/api/notifications`, { id: nid, read: true })
    log('PUT /api/notifications — mark as read (if supported)', r3.status === 200 || r3.status === 404 || r3.status === 405, `status=${r3.status}`)
  }

  // Fetch school-level notifications
  const r4 = await api('GET', `/api/notifications?school_id=${sid}`)
  log('GET /api/notifications?school_id — school-level notifications', Array.isArray(r4.data))
}

// ─── 11. Edge Cases & Validation ─────────────────────────────────────────────

async function testEdgeCases() {
  console.log('\n\x1b[1m── 11. Edge Cases & Validation ──\x1b[0m')
  const sid = cleanup.schoolId

  // Missing required fields
  const r1 = await api('POST', '/api/teachers', { school_id: sid })
  log('POST /api/teachers with missing name → 400', r1.status === 400 || r1.data?.error, `status=${r1.status}`)

  const r2 = await api('POST', '/api/leave-requests', { teacher_id: 999 })
  log('POST /api/leave-requests with missing fields → 400', r2.status === 400, `status=${r2.status}`)

  const r3 = await api('POST', '/api/classes', {})
  log('POST /api/classes with missing school_id → 400', r3.status === 400, `status=${r3.status}`)

  // Non-existent IDs
  const r4 = await api('GET', '/api/teachers/999999')
  log('GET /api/teachers/999999 (non-existent) → 404 or empty', r4.status === 404 || r4.data === null || (r4.data && !r4.data.id))

  // Free teacher list must not include teacher on leave
  if (sid && cleanup.teacherIds.length > 0) {
    const todayStr = today()
    const dayOfWeek = dayName(todayStr)
    // Create and approve a leave for teacher[3]
    const lr = await api('POST', '/api/leave-requests', {
      school_id: sid, teacher_id: cleanup.teacherIds[3],
      leave_type: 'Casual Leave', start_date: todayStr, end_date: todayStr, reason: 'edge case test',
    })
    if (lr.data?.id) {
      cleanup.leaveIds.push(lr.data.id)
      await api('PUT', `/api/leave-requests/${lr.data.id}`, { status: 'approved' })
      const freeList = await api('GET', `/api/substitutes?school_id=${sid}&day=${encodeURIComponent(dayOfWeek)}&period=2&date=${todayStr}`)
      const teacher3InList = Array.isArray(freeList.data) && freeList.data.some(t => t.id === cleanup.teacherIds[3])
      log('Free teacher list EXCLUDES teachers on approved leave', !teacher3InList,
        teacher3InList ? 'FAIL: on-leave teacher appeared in free list' : 'OK')
      // Clean up
      await api('PUT', `/api/leave-requests/${lr.data.id}`, { status: 'rejected' })
    }
  }

  // Duplicate substitute (ON CONFLICT UPDATE)
  if (sid && cleanup.teacherIds.length > 1 && cleanup.classIds.length > 0) {
    const todayStr = today()
    const lr = await api('POST', '/api/leave-requests', {
      school_id: sid, teacher_id: cleanup.teacherIds[4],
      leave_type: 'Sick Leave', start_date: todayStr, end_date: todayStr, reason: 'duplicate sub test',
    })
    if (lr.data?.id) {
      cleanup.leaveIds.push(lr.data.id)
      await api('PUT', `/api/leave-requests/${lr.data.id}`, { status: 'approved' })
      const sub1 = await api('POST', '/api/substitutes', {
        school_id: sid, leave_request_id: lr.data.id,
        original_teacher_id: cleanup.teacherIds[4],
        assignments: [{ class_id: cleanup.classIds[0], date: todayStr, day_of_week: dayName(todayStr),
          period_number: 3, subject_name: 'Biology', time_from: '09:40', time_to: '10:25',
          substitute_teacher_id: cleanup.teacherIds[5] }]
      })
      const sub2 = await api('POST', '/api/substitutes', {
        school_id: sid, leave_request_id: lr.data.id,
        original_teacher_id: cleanup.teacherIds[4],
        assignments: [{ class_id: cleanup.classIds[0], date: todayStr, day_of_week: dayName(todayStr),
          period_number: 3, subject_name: 'Biology', time_from: '09:40', time_to: '10:25',
          substitute_teacher_id: cleanup.teacherIds[1] }]  // re-assign to different teacher
      })
      log('Re-assigning substitute (ON CONFLICT UPDATE) → no error',
        sub2.status === 200 && sub2.data?.saved > 0, `status=${sub2.status}`)
    }
  }
}

// ─── 12. Cleanup ──────────────────────────────────────────────────────────────

async function cleanup_all() {
  console.log('\n\x1b[1m── 12. Cleanup ──\x1b[0m')
  const sid = cleanup.schoolId
  if (!sid) return

  // Reject/cleanup leave requests
  for (const lid of cleanup.leaveIds) {
    await api('DELETE', `/api/leave-requests/${lid}`)
  }

  // Delete students
  for (const id of cleanup.studentIds) {
    await api('DELETE', `/api/students/${id}`)
  }

  // Delete teachers (cascades timetable, leave requests, etc.)
  for (const id of cleanup.teacherIds) {
    await api('DELETE', `/api/teachers/${id}`)
  }

  // Delete classes (cascades timetable slots)
  for (const id of cleanup.classIds) {
    await api('DELETE', `/api/classes/${id}`)
  }

  // Delete school (cascades everything)
  const r = await api('DELETE', `/api/schools/${sid}`)
  log(`DELETE /api/schools/${sid} — delete test school (cascades all)`, r.status === 200 || r.status === 204, `status=${r.status}`)

  console.log('\n  Test data cleaned up.')
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('\x1b[1m\x1b[34m')
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║     WLYL Prototype — API Test Suite           ║')
  console.log('║     Target: http://localhost:3000             ║')
  console.log('╚════════════════════════════════════════════════╝')
  console.log('\x1b[0m')

  try {
    await testSchoolCreation()
    await testTeacherManagement()
    await testStudentManagement()
    await testClassManagement()
    await testCurriculum()
    await testTimetableGeneration()
    const leaveId = await testLeaveRequests()
    await testSubstitutes(leaveId)
    await testAttendance()
    await testNotifications()
    await testEdgeCases()
  } catch (err) {
    console.error('\n\x1b[31mUnexpected test runner error:\x1b[0m', err)
  }

  await cleanup_all()

  // ─── Summary ───
  console.log('\n\x1b[1m════════════════ RESULTS ════════════════\x1b[0m')
  console.log(`  \x1b[32m✓ Passed: ${passed}\x1b[0m`)
  console.log(`  \x1b[31m✗ Failed: ${failed}\x1b[0m`)
  console.log(`  Total:   ${passed + failed}`)

  if (issues.length > 0) {
    console.log('\n\x1b[1m\x1b[31mFailed Tests:\x1b[0m')
    issues.forEach(({ label, detail }, i) => {
      console.log(`  ${i + 1}. ${label}`)
      if (detail) console.log(`     → ${detail}`)
    })
  } else {
    console.log('\n  \x1b[32mAll tests passed!\x1b[0m')
  }

  process.exit(failed > 0 ? 1 : 0)
}

run()
