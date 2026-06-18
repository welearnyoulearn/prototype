const BASE = 'http://localhost:3000'

export type TestCredentials = {
  platformAdmin: { email: string; password: string }
  school: { id: number; name: string; code: string; tempPassword: string }
  schoolAdmin: { identifier: string; password: string; schoolId: number }
  teacher: { id: number; name: string; email: string; employeeId: string; schoolCode: string }
  student: { id: number; name: string; rollNumber: string }
  parent: { email: string }
}

const KNOWN_PASSWORD = 'Test@1234'

async function api(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

async function apiWithCookie(path: string, cookie: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  return { status: res.status, data: await res.json(), setCookie }
}

async function loginAndGetCookie(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    redirect: 'manual',
  })
  const cookies = res.headers.getSetCookie?.() ?? []
  const authCookie = cookies.find(c => c.startsWith('wlyl-auth='))
  if (!authCookie) throw new Error(`Login failed for ${identifier}: ${await res.text()}`)
  return authCookie.split(';')[0]
}

export async function seedTestData(): Promise<TestCredentials> {
  console.log('[seed] Starting test data setup...')

  // 1. Ensure platform admin exists
  const { data: adminCheck } = await api('/api/auth/setup-admin')
  if (!adminCheck.exists) {
    await api('/api/auth/setup-admin', {
      email: 'test-platform@wlyl.com',
      password: KNOWN_PASSWORD,
      secret: 'wlyl-setup-2024',
    })
    console.log('[seed] Created platform admin')
  }

  // 2. Create test school
  const { data: schoolData } = await api('/api/schools', {
    name: 'E2E Test Academy',
    type: 'Private',
    city: 'Hyderabad',
    country: 'India',
    phone: '9876543210',
    email: 'school@e2etest.com',
    address: '123 Test Street',
  })

  const school = {
    id: schoolData.id,
    name: schoolData.name,
    code: schoolData.school_code,
    tempPassword: schoolData.temp_password,
  }
  console.log(`[seed] Created school: ${school.name} (code: ${school.code})`)

  // 3. Set subscription plan
  await fetch(`${BASE}/api/schools/${school.id}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'premium' }),
  })
  console.log('[seed] Set school plan to premium')

  // 4. Login as school admin to create teacher + student
  const adminCookie = await loginAndGetCookie(school.code, school.tempPassword)
  console.log('[seed] Logged in as school admin')

  // 5. Create a class
  await apiWithCookie('/api/classes', adminCookie, {
    school_id: school.id,
    grade: '10',
    section: 'A',
  })
  console.log('[seed] Created class 10-A')

  // 6. Create teacher via bulk (no password generated — we'll use legacy login)
  const { data: teacherData } = await apiWithCookie('/api/teachers/bulk', adminCookie, {
    school_id: school.id,
    teachers: [{
      name: 'Priya Sharma',
      email: 'priya@e2etest.com',
      subject: 'Mathematics',
      phone: '9876500001',
      department: 'Science',
      staff_type: 'teaching',
    }],
  })
  const teacher = teacherData.teachers[0]
  console.log(`[seed] Created teacher: ${teacher.name} (employee_id: ${teacher.employee_id})`)

  // 7. Create student via bulk (no password generated)
  const { data: studentData } = await apiWithCookie('/api/students/bulk', adminCookie, {
    school_id: school.id,
    students: [{
      name: 'Rahul Kumar',
      email: 'rahul@e2etest.com',
      grade: '10',
      section: 'A',
      parent_name: 'Suresh Kumar',
      parent_phone: '9876500002',
      parent_email: 'suresh@e2etest.com',
    }],
  })
  const student = studentData.students[0]
  console.log(`[seed] Created student: ${student.name} (roll: ${student.roll_number})`)

  const creds: TestCredentials = {
    platformAdmin: { email: 'test-platform@wlyl.com', password: KNOWN_PASSWORD },
    school: school,
    schoolAdmin: { identifier: school.code, password: school.tempPassword, schoolId: school.id },
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      employeeId: teacher.employee_id,
      schoolCode: school.code,
    },
    student: { id: student.id, name: student.name, rollNumber: student.roll_number },
    parent: { email: 'suresh@e2etest.com' },
  }

  console.log('[seed] Test data setup complete!')
  console.log('[seed] School code:', school.code)
  console.log('[seed] School temp password:', school.tempPassword)
  console.log('[seed] Teacher employee_id:', teacher.employee_id)
  console.log('[seed] Student roll_number:', student.roll_number)

  return creds
}
