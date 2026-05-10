import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ensureDB } from '@/lib/db'

// GET /api/marketplace/order?student_id=X&school_id=Y
// Returns student's order history
export async function GET(req: NextRequest) {
  await ensureDB()
  const sp = req.nextUrl.searchParams
  const student_id = sp.get('student_id')
  const school_id  = sp.get('school_id')
  // Admin view: get all orders for a school
  const admin_school = sp.get('admin_school_id')

  try {
    if (admin_school) {
      const { rows } = await pool.query(
        `SELECT o.*, s.name AS student_name_db, s.grade, s.section
         FROM marketplace_orders o
         JOIN students s ON s.id = o.student_id
         WHERE o.school_id = $1
         ORDER BY o.ordered_at DESC
         LIMIT 200`,
        [admin_school]
      )
      return NextResponse.json(rows)
    }

    if (!student_id || !school_id)
      return NextResponse.json({ error: 'student_id and school_id required' }, { status: 400 })

    const { rows } = await pool.query(
      `SELECT id, item_name, item_emoji, points_spent, status, ordered_at, updated_at
       FROM marketplace_orders
       WHERE student_id = $1 AND school_id = $2
       ORDER BY ordered_at DESC`,
      [student_id, school_id]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('marketplace/order GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

// POST /api/marketplace/order
// Body: { student_id, school_id, item_id }
// Places an order — checks balance, creates order
export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { student_id, school_id, item_id } = await req.json()
    if (!student_id || !school_id || !item_id)
      return NextResponse.json({ error: 'student_id, school_id, item_id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get item details
      const { rows: [item] } = await client.query(
        `SELECT id, name, emoji, cost_points, active FROM marketplace_items WHERE id = $1`,
        [item_id]
      )
      if (!item || !item.active)
        return NextResponse.json({ error: 'Item not found or unavailable' }, { status: 404 })

      // Calculate current marketplace balance
      const { rows: [balRow] } = await client.query(
        `SELECT
           COALESCE(SUM(points) FILTER (WHERE points_type = 'marketplace'), 0)::int AS earned,
           COALESCE((
             SELECT SUM(points_spent) FROM marketplace_orders
             WHERE student_id = $1 AND school_id = $2 AND status IN ('pending','approved','delivered')
           ), 0)::int AS spent
         FROM student_points WHERE student_id = $1 AND school_id = $2`,
        [student_id, school_id]
      )
      const balance = (balRow.earned ?? 0) - (balRow.spent ?? 0)

      if (balance < item.cost_points) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: 'Insufficient marketplace points',
          balance,
          needed: item.cost_points,
        }, { status: 400 })
      }

      // Get student details for the order record
      const { rows: [student] } = await client.query(
        `SELECT name, grade, section FROM students WHERE id = $1`,
        [student_id]
      )

      const { rows: [order] } = await client.query(
        `INSERT INTO marketplace_orders
           (student_id, school_id, item_id, item_name, item_emoji, points_spent, status, student_name, grade, section)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
         RETURNING id, status, ordered_at`,
        [student_id, school_id, item.id, item.name, item.emoji, item.cost_points,
         student?.name ?? '', student?.grade ?? '', student?.section ?? '']
      )

      await client.query('COMMIT')

      return NextResponse.json({
        ok: true,
        order_id: order.id,
        item_name: item.name,
        points_spent: item.cost_points,
        new_balance: balance - item.cost_points,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('marketplace/order POST error:', err)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }
}

// PATCH /api/marketplace/order
// Body: { order_id, status } — admin updates order status
export async function PATCH(req: NextRequest) {
  await ensureDB()
  try {
    const { order_id, status } = await req.json()
    const allowed = ['approved', 'delivered', 'rejected']
    if (!order_id || !allowed.includes(status))
      return NextResponse.json({ error: `status must be one of: ${allowed.join(', ')}` }, { status: 400 })

    const { rows: [updated] } = await pool.query(
      `UPDATE marketplace_orders SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, status, updated_at`,
      [status, order_id]
    )
    if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    return NextResponse.json({ ok: true, order: updated })
  } catch (err) {
    console.error('marketplace/order PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
