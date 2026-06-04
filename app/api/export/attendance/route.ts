import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/export/attendance?school_id=&class_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns CSV: Date, Student Name, Roll No, Grade, Section, Morning, Afternoon
export async function GET(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id  = searchParams.get('class_id')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')

  if (!school_id || !class_id || !from || !to) {
    return NextResponse.json({ error: 'school_id, class_id, from, to required' }, { status: 400 })
  }

  const { rows } = await pool.query(`
    SELECT
      s.name            AS student_name,
      s.roll_number,
      s.grade,
      s.section,
      a.date::text,
      MAX(CASE WHEN a.session = 'morning'   THEN a.status END) AS morning,
      MAX(CASE WHEN a.session = 'afternoon' THEN a.status END) AS afternoon
    FROM students s
    JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
    JOIN classes c    ON c.id = $2 AND c.grade = s.grade AND c.section = s.section
    WHERE s.school_id = $1
      AND a.class_id  = $2
      AND a.date BETWEEN $3 AND $4
      AND (s.status IS NULL OR s.status = 'active')
    GROUP BY s.id, s.name, s.roll_number, s.grade, s.section, a.date
    ORDER BY a.date, s.name
  `, [school_id, class_id, from, to])

  // Build CSV
  const header = ['Date', 'Student Name', 'Roll No', 'Grade', 'Section', 'Morning', 'Afternoon']
  const csvRows = rows.map(r => [
    r.date, r.student_name, r.roll_number ?? '', r.grade, r.section,
    r.morning ?? 'unmarked', r.afternoon ?? 'unmarked',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

  const csv = [header.join(','), ...csvRows].join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance_${from}_to_${to}.csv"`,
    },
  })
}
