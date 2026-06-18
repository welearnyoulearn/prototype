import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { encrypt, encryptionAvailable } from '@/lib/encryption'

// GET /api/whatsapp-config?school_id=X
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'whatsapp')
    if (!enabled) return NextResponse.json({ error: 'WhatsApp not enabled for this school' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT phone_number_id, waba_id, fee_reminder_template,
              payment_receipt_template, is_active, updated_at
       FROM school_whatsapp_config WHERE school_id = $1`,
      [access.schoolId]
    )

    if (rows.length === 0) return NextResponse.json({ configured: false })

    return NextResponse.json({
      configured: true,
      access_token: '••••••••',
      phone_number_id: rows[0].phone_number_id,
      waba_id: rows[0].waba_id,
      fee_reminder_template: rows[0].fee_reminder_template,
      payment_receipt_template: rows[0].payment_receipt_template,
      is_active: rows[0].is_active,
      updated_at: rows[0].updated_at,
    })
  } catch (err) {
    console.error('[whatsapp-config GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/whatsapp-config
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      school_id, access_token, phone_number_id, waba_id,
      fee_reminder_template, payment_receipt_template, is_active,
    } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'whatsapp')
    if (!enabled) return NextResponse.json({ error: 'WhatsApp not enabled for this school' }, { status: 403 })

    if (!phone_number_id?.trim()) {
      return NextResponse.json({ error: 'Phone Number ID is required' }, { status: 400 })
    }
    if (!encryptionAvailable()) {
      return NextResponse.json({ error: 'ENCRYPTION_KEY not configured on server. Contact platform admin.' }, { status: 500 })
    }

    const existing = await pool.query(
      `SELECT access_token_encrypted FROM school_whatsapp_config WHERE school_id = $1`,
      [access.schoolId]
    )

    let tokenEncrypted: string | undefined
    if (access_token && access_token.trim() && access_token !== '••••••••') {
      tokenEncrypted = encrypt(access_token.trim())
    } else if (existing.rows.length > 0) {
      tokenEncrypted = existing.rows[0].access_token_encrypted
    } else {
      return NextResponse.json({ error: 'Access token is required for first-time setup' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO school_whatsapp_config
         (school_id, provider, access_token_encrypted, phone_number_id, waba_id,
          fee_reminder_template, payment_receipt_template, is_active, updated_at)
       VALUES ($1, 'meta', $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (school_id) DO UPDATE SET
         access_token_encrypted   = $2,
         phone_number_id          = $3,
         waba_id                  = $4,
         fee_reminder_template    = $5,
         payment_receipt_template = $6,
         is_active                = $7,
         updated_at               = NOW()`,
      [
        access.schoolId, tokenEncrypted, phone_number_id.trim(),
        waba_id?.trim() || null,
        fee_reminder_template?.trim() || null,
        payment_receipt_template?.trim() || null,
        Boolean(is_active),
      ]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[whatsapp-config PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
