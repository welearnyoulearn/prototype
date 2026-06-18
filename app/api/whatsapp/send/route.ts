import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'

const VALID_TYPES = ['fee_reminder', 'payment_receipt'] as const
type MessageType = typeof VALID_TYPES[number]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      school_id, recipient_phone, recipient_name, message_type,
      student_name, amount, period_label, category_name, receipt_number,
    } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'whatsapp')
    if (!enabled) return NextResponse.json({ error: 'WhatsApp not enabled for this school' }, { status: 403 })

    if (!recipient_phone?.trim()) {
      return NextResponse.json({ error: 'recipient_phone required' }, { status: 400 })
    }
    if (!VALID_TYPES.includes(message_type as MessageType)) {
      return NextResponse.json({ error: 'message_type must be fee_reminder or payment_receipt' }, { status: 400 })
    }

    const cfgRes = await pool.query(
      `SELECT access_token_encrypted, phone_number_id,
              fee_reminder_template, payment_receipt_template, is_active
       FROM school_whatsapp_config WHERE school_id = $1`,
      [access.schoolId]
    )
    if (cfgRes.rows.length === 0 || !cfgRes.rows[0].is_active) {
      return NextResponse.json({ error: 'WhatsApp not configured or not active for this school' }, { status: 422 })
    }

    const cfg = cfgRes.rows[0]

    let accessToken: string
    try {
      accessToken = decrypt(cfg.access_token_encrypted)
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt WhatsApp credentials' }, { status: 500 })
    }

    const templateName: string = message_type === 'fee_reminder'
      ? cfg.fee_reminder_template
      : cfg.payment_receipt_template

    if (!templateName) {
      return NextResponse.json({ error: 'Template not configured for this message type' }, { status: 422 })
    }

    const bodyParams: string[] = message_type === 'fee_reminder'
      ? [student_name || '', String(amount || ''), period_label || '', category_name || '']
      : [student_name || '', String(amount || ''), receipt_number || '', category_name || '']

    const phoneNumber = '91' + recipient_phone.replace(/\D/g, '').slice(-10)

    const result = await sendWhatsAppTemplate(accessToken, cfg.phone_number_id, {
      phoneNumber,
      templateName,
      languageCode: 'en',
      bodyParams,
      callbackData: `${access.schoolId}:${message_type}`,
    })

    const status = result.error ? 'failed' : 'sent'

    const msgRes = await pool.query(
      `INSERT INTO whatsapp_messages
         (school_id, sent_by_user_id, recipient_phone, recipient_name, message_type,
          template_name, template_params, provider, provider_message_id,
          status, failure_reason, sent_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'meta',$8,$9,$10,$11,NOW())
       RETURNING id`,
      [
        access.schoolId, access.userId ?? null, phoneNumber,
        recipient_name || null, message_type, templateName,
        JSON.stringify({ bodyParams }),
        result.messageId || null, status,
        result.error || null,
        status === 'sent' ? new Date() : null,
      ]
    )

    const yearMonth = new Date().toISOString().slice(0, 7)
    await pool.query(
      `INSERT INTO whatsapp_usage_summary (school_id, year_month, message_type, sent_count, delivered_count, failed_count)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (school_id, year_month, message_type) DO UPDATE SET
         sent_count   = whatsapp_usage_summary.sent_count   + $4,
         failed_count = whatsapp_usage_summary.failed_count + $5`,
      [access.schoolId, yearMonth, message_type, status === 'sent' ? 1 : 0, status === 'failed' ? 1 : 0]
    )

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      message_id: msgRes.rows[0].id,
      provider_message_id: result.messageId,
    }, { status: 201 })
  } catch (err) {
    console.error('[whatsapp/send]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
