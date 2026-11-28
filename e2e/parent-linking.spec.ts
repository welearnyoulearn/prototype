import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #516 — a parent email used at another school does not reject an admission.
// #517 — siblings sharing a phone get one parent, whichever row carries the email.

test.describe.serial('Parent linking on admission (#516, #517)', () => {
  let a: AdminSchool
  let b: AdminSchool
  const email = (tag: string) => `${tag}-${Date.now()}@test.invalid`

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    a = await createAdminSchool('plink-a')
    b = await createAdminSchool('plink-b')
  })
  test.afterAll(async () => { await a?.cleanup(); await b?.cleanup() })

  let roll = 0
  const child = (name: string, parent_phone: string, parent_email?: string) =>
    ({ name, grade: '8', section: 'A', school_roll_number: ++roll, parent_name: 'Family Parent', parent_phone, ...(parent_email ? { parent_email } : {}) })
  const importRows = async (school: AdminSchool, students: object[]) => {
    const res = await school.admin.post('/api/students/bulk', { data: { school_id: school.schoolId, students } })
    expect(res.status(), await res.text()).toBe(201)
    return await res.json() as {
      inserted: number; warnings: string[]
      credentials: { parents: Array<{ login: string; temp_password: string }> }
    }
  }
  const parentsOf = async (school: AdminSchool, names: string[]) => (await pool.query<{ id: number; email: string | null; phone: string; student: string }>(
    `SELECT p.id, p.email, p.phone, s.name AS student FROM students s
     JOIN student_parents sp ON sp.student_id = s.id JOIN parents p ON p.id = sp.parent_id
     WHERE s.school_id = $1 AND s.name = ANY($2) ORDER BY s.name`, [school.schoolId, names])).rows
  const canSignIn = async (login: string, password: string) => {
    const res = await a.admin.post('/api/parent/auth/login', {
      data: { identifier: login, password }, headers: { 'X-Forwarded-For': `10.1.${roll}.${Math.floor(Math.random() * 250)}`, Cookie: '' },
    })
    return res.status()
  }

  for (const [label, emailRow] of [['first', 0], ['second', 1]] as const) {
    test(`siblings with the email on the ${label} row get one parent`, async () => {
      const phone = a.phone()
      const address = email(`sib-${label}`)
      const names = [`Elder ${label}`, `Younger ${label}`]
      const out = await importRows(a, names.map((n, i) => child(n, phone, i === emailRow ? address : undefined)))
      expect(out.inserted).toBe(2)
      const links = await parentsOf(a, names)
      expect(links).toHaveLength(2)
      expect(links[0].id).toBe(links[1].id)
      expect(links[0]).toMatchObject({ email: address, phone })
      expect(out.credentials.parents).toHaveLength(1)
      expect(out.credentials.parents[0].login).toBe(address)
      expect(await canSignIn(address, out.credentials.parents[0].temp_password)).toBe(200)
    })
  }

  test('an email already used at another school: both are admitted, the parent signs in by phone', async () => {
    const shared = email('shared')
    await importRows(a, [child('At School A', a.phone(), shared)])
    const phone = b.phone()
    const out = await importRows(b, [child('At School B', phone, shared.toUpperCase()), child('Unrelated Child', b.phone())])
    expect(out.inserted).toBe(2)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('phone number')
    expect(out.warnings[0]).not.toContain('plink-a')
    const [link] = await parentsOf(b, ['At School B'])
    expect(link).toMatchObject({ email: null, phone })
    const credential = out.credentials.parents.find(p => p.login === phone)!
    expect(await canSignIn(phone, credential.temp_password)).toBe(200)
  })

  test('adding one student with such an email also creates the parent and warns', async () => {
    const shared = email('single')
    await importRows(a, [child('Single A', a.phone(), shared)])
    const phone = b.phone()
    const res = await b.admin.post('/api/students', { data: { school_id: b.schoolId, ...child('Single B', phone, shared) } })
    expect(res.status(), await res.text()).toBe(201)
    expect((await res.json()).parent_warning).toContain('phone number')
    expect((await parentsOf(b, ['Single B']))[0]).toMatchObject({ email: null, phone })
  })

  test('a later sibling joins the existing parent', async () => {
    const phone = a.phone()
    await importRows(a, [child('Early Bird', phone, email('early'))])
    const out = await importRows(a, [child('Late Comer', phone)])
    expect(out.credentials.parents).toHaveLength(0)
    const links = await parentsOf(a, ['Early Bird', 'Late Comer'])
    expect(links[0].id).toBe(links[1].id)
  })
})
