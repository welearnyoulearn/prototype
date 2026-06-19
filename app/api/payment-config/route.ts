import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { encrypt, encryptionAvailable } from '@/lib/encryption'

// GET /api/payment-config?school_id=X
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT cashfree_app_id, is_active, updated_at
       FROM school_payment_config WHERE school_id = $1`,
      [access.schoolId]
    )

    if (rows.length === 0) return NextResponse.json({ configured: false })

    return NextResponse.json({
      configured: true,
      cashfree_app_id: rows[0].cashfree_app_id,
      cashfree_secret: '••••••••',
      is_active: rows[0].is_active,
      updated_at: rows[0].updated_at,
    })
  } catch (err) {
    console.error('[payment-config GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/payment-config
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, cashfree_app_id, cashfree_secret, is_active } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!cashfree_app_id?.trim()) {
      return NextResponse.json({ error: 'Cashfree App ID is required' }, { status: 400 })
    }
    if (!encryptionAvailable()) {
      return NextResponse.json({ error: 'ENCRYPTION_KEY not configured on server. Contact platform admin.' }, { status: 500 })
    }

    const existing = await pool.query(
      `SELECT cashfree_secret_encrypted FROM school_payment_config WHERE school_id = $1`,
      [access.schoolId]
    )

    let secretEncrypted: string | undefined
    if (cashfree_secret && cashfree_secret.trim() && cashfree_secret !== '••••••••') {
      secretEncrypted = encrypt(cashfree_secret.trim())
    } else if (existing.rows.length > 0) {
      secretEncrypted = existing.rows[0].cashfree_secret_encrypted
    } else {
      return NextResponse.json({ error: 'Cashfree Secret Key is required for first-time setup' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO school_payment_config
         (school_id, cashfree_app_id, cashfree_secret_encrypted, is_active, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (school_id) DO UPDATE SET
         cashfree_app_id          = $2,
         cashfree_secret_encrypted = $3,
         is_active                = $4,
         updated_at               = NOW()`,
      [access.schoolId, cashfree_app_id.trim(), secretEncrypted, Boolean(is_active)]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[payment-config PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
