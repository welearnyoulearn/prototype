import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

// POST /api/payments/create-order
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, student_id, ledger_ids, parent_name, parent_phone, parent_email } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'online-payments')
    if (!enabled) return NextResponse.json({ error: 'Online payments not enabled for this school' }, { status: 403 })

    if (!student_id || !Array.isArray(ledger_ids) || ledger_ids.length === 0) {
      return NextResponse.json({ error: 'student_id and ledger_ids required' }, { status: 400 })
    }

    const safeIds = ledger_ids.map(Number).filter(n => Number.isInteger(n) && n > 0)
    if (safeIds.length === 0) return NextResponse.json({ error: 'Invalid ledger_ids' }, { status: 400 })

    // Get Cashfree credentials for this school
    const cfgRes = await pool.query(
      `SELECT cashfree_app_id, cashfree_secret_encrypted, is_active
       FROM school_payment_config WHERE school_id = $1`,
      [access.schoolId]
    )
    if (cfgRes.rows.length === 0 || !cfgRes.rows[0].is_active) {
      return NextResponse.json({ error: 'Online payments not configured for this school' }, { status: 422 })
    }

    const cfg = cfgRes.rows[0]
    let secretKey: string
    try {
      secretKey = decrypt(cfg.cashfree_secret_encrypted)
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt payment credentials' }, { status: 500 })
    }

    // Calculate total from ledger entries
    const ledgerRes = await pool.query(
      `SELECT id, amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount
       FROM student_fee_ledger
       WHERE id = ANY($1) AND school_id = $2 AND status NOT IN ('paid','waived')`,
      [safeIds, access.schoolId]
    )

    const totalAmount = ledgerRes.rows.reduce((sum, row) => {
      const balance = Number(row.amount_due) - Number(row.waiver_amount) - Number(row.amount_paid)
      return sum + Math.max(0, balance)
    }, 0)

    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'No outstanding balance for selected entries' }, { status: 422 })
    }

    const sortedIds = [...safeIds].sort((a, b) => a - b)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const orderId = `WLYL-${access.schoolId}-${Date.now()}`
    const idempotencyKey = `${access.schoolId}-${student_id}-${sortedIds.join('_')}-${today}`

    // Check if order already exists for same idempotency key
    const existing = await pool.query(
      `SELECT cashfree_order_id, payment_link FROM payment_transactions WHERE idempotency_key = $1`,
      [idempotencyKey]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({
        success: true,
        order_id: existing.rows[0].cashfree_order_id,
        payment_link: existing.rows[0].payment_link,
      })
    }

    // Create Cashfree payment link
    const cashfreeRes = await fetch('https://api.cashfree.com/pg/links', {
      method: 'POST',
      headers: {
        'x-client-id': cfg.cashfree_app_id,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        link_id: orderId,
        link_amount: totalAmount,
        link_currency: 'INR',
        link_purpose: 'School Fee Payment',
        customer_details: {
          customer_name: parent_name || 'Parent',
          customer_phone: parent_phone?.replace(/\D/g, '').slice(-10) || '9999999999',
          customer_email: parent_email || '',
        },
        link_notify: { send_sms: false, send_email: false },
        link_meta: { return_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/payment-status?order_id=${orderId}` },
      }),
    })

    const cashfreeData = await cashfreeRes.json()

    if (!cashfreeData.link_url) {
      console.error('[create-order] Cashfree error:', cashfreeData)
      return NextResponse.json({ error: cashfreeData.message || 'Failed to create payment link' }, { status: 502 })
    }

    // Store transaction
    await pool.query(
      `INSERT INTO payment_transactions
         (school_id, student_id, cashfree_order_id, payment_link, amount, status,
          ledger_ids, parent_name, parent_phone, idempotency_key, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9,NOW(),NOW())`,
      [
        access.schoolId, student_id, orderId, cashfreeData.link_url,
        totalAmount, safeIds, parent_name || null,
        parent_phone?.replace(/\D/g, '').slice(-10) || null,
        idempotencyKey,
      ]
    )

    return NextResponse.json({
      success: true,
      order_id: orderId,
      payment_link: cashfreeData.link_url,
    }, { status: 201 })
  } catch (err) {
    console.error('[create-order]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
