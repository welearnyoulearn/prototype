import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/payments/transactions?school_id=X&status=X&student_id=X&page=1
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const school_id = params.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const status     = params.get('status')
    const student_id = params.get('student_id')
    const page       = Math.max(1, parseInt(params.get('page') || '1'))
    const limit      = 50
    const offset     = (page - 1) * limit

    const conditions: string[] = ['pt.school_id = $1']
    const values: (string | number)[] = [access.schoolId]
    let idx = 2

    if (status) { conditions.push(`pt.status = $${idx++}`); values.push(status) }
    if (student_id) { conditions.push(`pt.student_id = $${idx++}`); values.push(Number(student_id)) }

    const where = conditions.join(' AND ')

    const { rows } = await pool.query(
      `SELECT pt.id, pt.cashfree_order_id, pt.payment_link, pt.amount, pt.status,
              pt.parent_name, pt.parent_phone, pt.created_at, pt.updated_at,
              s.name AS student_name, s.grade, s.section
       FROM payment_transactions pt
       JOIN students s ON s.id = pt.student_id
       WHERE ${where}
       ORDER BY pt.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values
    )

    return NextResponse.json({ transactions: rows, page, limit })
  } catch (err) {
    console.error('[payments/transactions]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
