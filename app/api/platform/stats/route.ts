import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [schools, teachers, students, subs] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'active')   AS active,
        COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
        COUNT(*) AS total
        FROM schools`),
      pool.query(`SELECT COUNT(*) AS total FROM teachers WHERE status = 'active' AND school_id IN (SELECT id FROM schools WHERE status = 'active')`),
      pool.query(`SELECT COUNT(*) AS total FROM students WHERE school_id IN (SELECT id FROM schools WHERE status = 'active') AND status = 'active'`),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE tier = 'basic')    AS basic,
        COUNT(*) FILTER (WHERE tier = 'standard') AS standard,
        COUNT(*) FILTER (WHERE tier = 'premium')  AS premium,
        COUNT(*) FILTER (WHERE tier = 'none')     AS none
        FROM school_subscriptions`),
    ])
    return NextResponse.json({
      schools:       schools.rows[0],
      teachers:      teachers.rows[0],
      students:      students.rows[0],
      subscriptions: subs.rows[0],
    })
  } catch (error) {
    console.error('[platform/stats]', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
