import { NextRequest, NextResponse } from 'next/server'
import { getAnySession } from '@/lib/auth'
import pool, { ensureDB } from '@/lib/db'

// POST /api/exams/[id]/acknowledge
// Parent acknowledges seeing student's result
// Body: { student_id, school_id, parent_name, parent_phone? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: exam_id } = await params
  const body = await req.json()
  const { student_id, school_id, parent_name, parent_phone } = body

  if (!student_id || !school_id || !parent_name) {
    return NextResponse.json({ error: 'student_id, school_id, parent_name required' }, { status: 400 })
  }

  try {
    // Verify exam is published
    const { rows: [exam] } = await pool.query(
      `SELECT id FROM exam_records WHERE id = $1 AND school_id = $2 AND status = 'published'`,
      [exam_id, school_id]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found or not published' }, { status: 404 })

    await pool.query(`
      INSERT INTO parent_mark_acks (exam_id, student_id, school_id, parent_name, parent_phone, acknowledged_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (exam_id, student_id) DO UPDATE SET
        parent_name = EXCLUDED.parent_name,
        parent_phone = EXCLUDED.parent_phone,
        acknowledged_at = NOW()
    `, [exam_id, student_id, school_id, parent_name, parent_phone || null])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/exams/[id]/acknowledge error:', err)
    return NextResponse.json({ error: 'Failed to save acknowledgement' }, { status: 500 })
  }
}