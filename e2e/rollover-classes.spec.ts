import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #520 — year rollover never leaves a promoted student in a class that does not exist.

const GRADES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

test.describe.serial('Year rollover creates the classes it needs (#520)', () => {
  let school: AdminSchool
  let fromId = 0
  let toId = 0
  const ids: Record<string, number> = {}
  let removedClass = 0

  const classes = async () => (await pool.query<{ name: string; teacher: number | null }>(
    `SELECT grade || '-' || section AS name, class_teacher_id AS teacher FROM classes WHERE school_id = $1 AND deleted_at IS NULL ORDER BY 1`, [school.schoolId])).rows
  const grades = async () => (await pool.query<{ grade: string }>('SELECT grade FROM students WHERE school_id = $1 ORDER BY id', [school.schoolId])).rows.map(r => r.grade)
  const roll = () => school.admin.post('/api/academic-years/rollover', { data: {
    school_id: school.schoolId, from_year_id: fromId, to_year_id: toId, final_grade: '10', grade_sequence: GRADES,
  } })

  test.beforeAll(async () => {
    school = await createAdminSchool('rollclass')
    // No fee year-end to close in this test: fee management is switched off for the school.
    await pool.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, 'fee-management', FALSE)`, [school.schoolId])
    const year = async (label: string, start: string, end: string, current: boolean) => (await pool.query<{ id: number }>(
      'INSERT INTO academic_years (school_id, label, start_date, end_date, is_current) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [school.schoolId, label, start, end, current])).rows[0].id
    fromId = await year('3070-71', '3070-04-01', '3071-03-31', true)
    toId = await year('3071-72', '3071-04-01', '3072-03-31', false)
    for (const [name, grade, section] of [['six', '6', 'A'], ['eightA', '8', 'A'], ['eightB', '8', 'B'], ['ten', '10', 'A']]) {
      ids[name] = await school.addStudent(`Roll ${name}`, { grade, section })
      await pool.query('INSERT INTO classes (school_id, grade, section) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [school.schoolId, grade, section])
    }
    removedClass = (await pool.query<{ id: number }>(
      `INSERT INTO classes (school_id, grade, section, deleted_at) VALUES ($1,'9','B',NOW()) RETURNING id`, [school.schoolId])).rows[0].id
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('a removed target class stops the rollover before anything changes', async () => {
    const res = await roll()
    const body = await res.json() as { error: string; code: string }
    expect(res.status(), body.error).toBe(409)
    expect(body.code).toBe('CLASS_REMOVED')
    expect(body.error).toContain('9-B')
    expect(await grades()).toEqual(['6', '8', '8', '10'])
    expect((await classes()).map(c => c.name)).not.toContain('7-A')
  })

  test('after restoring it, missing classes are created and listed', async () => {
    const restored = await school.admin.post(`/api/classes/${removedClass}/restore`)
    expect(restored.status(), await restored.text()).toBe(200)
    const res = await roll()
    const body = await res.json() as { classes_created: string[]; promoted: number; graduated: number }
    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ promoted: 3, graduated: 1, classes_created: ['7-A', '9-A'] })

    const orphans = await pool.query(
      `SELECT s.name FROM students s WHERE s.school_id = $1 AND s.status = 'active' AND NOT EXISTS (
         SELECT 1 FROM classes c WHERE c.school_id = s.school_id AND c.grade = s.grade AND c.section = s.section AND c.deleted_at IS NULL)`, [school.schoolId])
    expect(orphans.rows).toEqual([])
    const listed = await (await school.admin.get(`/api/classes?school_id=${school.schoolId}`)).json() as Array<{ grade: string; section: string }>
    expect(listed.map(c => `${c.grade}-${c.section}`)).toEqual(expect.arrayContaining(['7-A', '9-A', '9-B']))
  })
})
