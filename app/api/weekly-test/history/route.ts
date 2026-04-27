import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/weekly-test/history?student_id=&school_id=&limit=10
// Returns past weekly test results for a student, newest first.
export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams
  const student_id = sp.get('student_id')
  const school_id  = sp.get('school_id')
  const limit      = Math.min(parseInt(sp.get('limit') ?? '10'), 52)  // max 1 year

  if (!student_id || !school_id)
    return NextResponse.json({ error: 'student_id and school_id required' }, { status: 400 })

  try {
    const { rows } = await pool.query(`
      SELECT id, week_start::text, status, score, max_score, submitted_at, generated_at
      FROM weekly_tests
      WHERE student_id = $1 AND school_id = $2
      ORDER BY week_start DESC
      LIMIT $3
    `, [student_id, school_id, limit])

    return NextResponse.json({ tests: rows })
  } catch (err) {
    console.error('weekly-test/history error:', err)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
