import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/students/promote?school_id=
// Returns current grade distribution — preview of who will be promoted where.
export async function GET(req: NextRequest) {

  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows } = await pool.query(`
    SELECT
      s.grade,
      s.section,
      COUNT(*)::int AS student_count
    FROM students s
    WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
    GROUP BY s.grade, s.section
    ORDER BY s.grade, s.section
  `, [school_id])

  return NextResponse.json({ groups: rows })
}

// POST /api/students/promote
// Body: { school_id, promotions: [{ from_grade, from_section, to_grade, to_section }], graduate_grade? }
// Promotes students in bulk: updates grade + section, optionally marks graduating students as 'graduated'.
// Returns: { promoted: number, graduated: number, skipped: number }
export async function POST(req: NextRequest) {

  const body = await req.json()
  const { school_id, promotions, graduate_grade } = body

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!Array.isArray(promotions) || promotions.length === 0) {
    return NextResponse.json({ error: 'promotions array required' }, { status: 400 })
  }

  for (const p of promotions) {
    if (!p.from_grade || !p.from_section || !p.to_grade || !p.to_section) {
      return NextResponse.json({ error: 'Each promotion needs from_grade, from_section, to_grade, to_section' }, { status: 400 })
    }
  }

  const client = await pool.connect()
  let promoted = 0
  let graduated = 0

  try {
    await client.query('BEGIN')

    for (const p of promotions) {
      const { rowCount } = await client.query(`
        UPDATE students
        SET grade = $1, section = $2
        WHERE school_id = $3
          AND grade = $4
          AND section = $5
          AND (status IS NULL OR status = 'active')
      `, [p.to_grade, p.to_section, school_id, p.from_grade, p.from_section])
      promoted += rowCount ?? 0
    }

    // Graduate students in the final grade (mark status = 'graduated')
    if (graduate_grade) {
      const { rowCount } = await client.query(`
        UPDATE students
        SET status = 'graduated'
        WHERE school_id = $1
          AND grade = $2
          AND (status IS NULL OR status = 'active')
      `, [school_id, graduate_grade])
      graduated += rowCount ?? 0
      promoted = Math.max(0, promoted - graduated)
    }

    await client.query('COMMIT')
    return NextResponse.json({ promoted, graduated, total: promoted + graduated })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[students/promote]', err)
    return NextResponse.json({ error: 'Promotion failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
