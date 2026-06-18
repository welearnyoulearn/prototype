import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

// GET /api/payments/status/[orderId]?school_id=X
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const txnRes = await pool.query(
      `SELECT cashfree_order_id, status, amount, payment_link, updated_at
       FROM payment_transactions WHERE cashfree_order_id = $1 AND school_id = $2`,
      [orderId, access.schoolId]
    )
    if (txnRes.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const txn = txnRes.rows[0]

    // If already resolved, return from DB
    if (['PAID', 'FAILED', 'EXPIRED'].includes(txn.status)) {
      return NextResponse.json({ order_id: orderId, status: txn.status, amount: txn.amount })
    }

    // Check live status from Cashfree
    const cfgRes = await pool.query(
      `SELECT cashfree_app_id, cashfree_secret_encrypted FROM school_payment_config WHERE school_id = $1 AND is_active = true`,
      [access.schoolId]
    )
    if (cfgRes.rows.length === 0) {
      return NextResponse.json({ order_id: orderId, status: txn.status, amount: txn.amount })
    }

    let secretKey: string
    try {
      secretKey = decrypt(cfgRes.rows[0].cashfree_secret_encrypted)
    } catch (e) {
      console.error('[payment-status] decrypt error:', e)
      return NextResponse.json({ order_id: orderId, status: txn.status, amount: txn.amount })
    }

    const cfRes = await fetch(`https://api.cashfree.com/pg/links/${orderId}`, {
      headers: {
        'x-client-id': cfgRes.rows[0].cashfree_app_id,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
      },
    })
    const cfData = await cfRes.json()

    return NextResponse.json({
      order_id: orderId,
      status: txn.status,
      cashfree_status: cfData.link_status,
      amount: txn.amount,
    })
  } catch (err) {
    console.error('[payment-status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
