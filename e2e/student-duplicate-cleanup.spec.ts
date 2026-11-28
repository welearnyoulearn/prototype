import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #513 — merging duplicate students works, moves what belongs to the child, and never destroys history.

test.describe.serial('Duplicate student cleanup (#513)', () => {
  let school: AdminSchool
  const one = async <T = number>(sql: string, p: unknown[]) => (await pool.query(sql, p)).rows[0] as T
  const exists = async (id: number) => (await pool.query('SELECT 1 FROM students WHERE id = $1', [id])).rowCount === 1
  const cleanup = async (body: object = { cleanup_all: true }) => {
    const res = await school.admin.post('/api/students/duplicates/cleanup', { data: { school_id: school.schoolId, ...body } })
    expect(res.status(), await res.text()).toBe(200)
    return await res.json() as { deleted: number; skipped: number; errors: Array<{ dup_id: number; reason: string }> }
  }
  /** The same child entered twice; the first is the one kept. */
  async function pair(name: string) {
    const parent_phone = school.phone()
    const keep = await school.addStudent(name, { parent_phone })
    const dup = await school.addStudent(name, { parent_phone })
    return { keep, dup }
  }

  test.beforeAll(async () => { school = await createAdminSchool('dups') })
  test.afterAll(async () => { await school?.cleanup() })

  test('an empty duplicate is removed and its attendance and parent move over', async () => {
    const { keep, dup } = await pair('Twin Entry')
    const parent = (await one<{ id: number }>(`INSERT INTO parents (school_id, name, phone) VALUES ($1, 'Parent', $2) RETURNING id`, [school.schoolId, school.phone()])).id
    await pool.query('INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)', [dup, parent])
    const classId = (await one<{ id: number }>(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '8', 'A') ON CONFLICT DO NOTHING RETURNING id`, [school.schoolId])).id
    const mark = (student: number, date: string, status: string) => pool.query(
      `INSERT INTO attendance (school_id, class_id, student_id, date, session, status) VALUES ($1, $2, $3, $4, 'morning', $5)`,
      [school.schoolId, classId, student, date, status])
    await mark(keep, '2026-06-01', 'present'); await mark(dup, '2026-06-01', 'absent'); await mark(dup, '2026-06-02', 'late')

    expect(await cleanup({ duplicate_ids: [dup] })).toMatchObject({ deleted: 1, skipped: 0 })
    expect(await exists(dup)).toBe(false)
    const att = await pool.query(`SELECT date::text AS d, status FROM attendance WHERE student_id = $1 ORDER BY date`, [keep])
    expect(att.rows).toEqual([{ d: '2026-06-01', status: 'present' }, { d: '2026-06-02', status: 'late' }])
    expect((await pool.query('SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2', [keep, parent])).rowCount).toBe(1)
  })

  test('a duplicate with exam marks or points is left alone and says why', async () => {
    const { dup } = await pair('Has History')
    await pool.query(`INSERT INTO student_points (student_id, school_id, points, action_type) VALUES ($1, $2, 5, 'test')`, [dup, school.schoolId])
    const out = await cleanup({ duplicate_ids: [dup] })
    expect(out).toMatchObject({ deleted: 0, skipped: 1 })
    expect(out.errors[0].reason).toContain('points')
    expect(await exists(dup)).toBe(true)
    expect((await pool.query('SELECT 1 FROM student_points WHERE student_id = $1', [dup])).rowCount).toBe(1)
  })

  test('delete all removes the safe ones and keeps the rest', async () => {
    const safe = await pair('Safe One')
    expect(await cleanup()).toMatchObject({ deleted: 1, skipped: 1 })
    expect(await exists(safe.dup)).toBe(false)
    expect(await exists(safe.keep)).toBe(true)
  })
})
