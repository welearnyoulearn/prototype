import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [schools, teachers, students, subs, growth] = await Promise.all([
      // Only count non-deleted schools
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')   AS active,
          COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
          COUNT(*) AS total
        FROM schools
        WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM teachers
        WHERE status = 'active'
          AND school_id IN (
            SELECT id FROM schools WHERE status = 'active' AND deleted_at IS NULL
          )
      `),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM students
        WHERE status = 'active'
          AND school_id IN (
            SELECT id FROM schools WHERE status = 'active' AND deleted_at IS NULL
          )
      `),
      // Only count subscriptions for non-deleted schools
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE ss.tier = 'basic')    AS basic,
          COUNT(*) FILTER (WHERE ss.tier = 'standard') AS standard,
          COUNT(*) FILTER (WHERE ss.tier = 'premium')  AS premium,
          COUNT(*) FILTER (WHERE ss.tier = 'none')     AS none
        FROM school_subscriptions ss
        INNER JOIN schools s ON s.id = ss.school_id
        WHERE s.deleted_at IS NULL AND s.status = 'active'
      `),
      // New schools this month vs last month (non-deleted)
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))                                   AS this_month,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now() - interval '1 month')
                             AND created_at <  date_trunc('month', now()))                                   AS last_month
        FROM schools
        WHERE deleted_at IS NULL
      `),
    ])

    return NextResponse.json({
      schools:       schools.rows[0],
      teachers:      teachers.rows[0],
      students:      students.rows[0],
      subscriptions: subs.rows[0],
      growth: {
        this_month: Number(growth.rows[0].this_month),
        last_month: Number(growth.rows[0].last_month),
      },
    })
  } catch (error) {
    console.error('[platform/stats]', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
