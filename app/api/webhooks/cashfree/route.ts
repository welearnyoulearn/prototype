import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import pool from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  let rawBody = ''
  let payload: Record<string, unknown> = {}

  try {
    rawBody = await req.text()
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const orderId   = ((payload?.data as Record<string, unknown>)?.order as Record<string, unknown>)?.order_id as string ?? ''
  const eventType = payload?.type as string ?? ''

  let logId: number | null = null
  try {
    const logRes = await pool.query(
      `INSERT INTO payment_webhook_log
         (cashfree_order_id, event_type, raw_payload, signature_valid, processed, received_at)
       VALUES ($1,$2,$3,false,false,NOW()) RETURNING id`,
      [orderId || null, eventType || null, payload]
    )
    logId = logRes.rows[0]?.id ?? null
  } catch (err) {
    console.error('[webhook/cashfree] log error:', err)
  }

  // Resolve school_id from order_id format: WLYL-{school_id}-{timestamp}
  let schoolId: number | null = null
  if (orderId) {
    const parsed = parseInt(orderId.split('-')[1])
    if (!isNaN(parsed)) schoolId = parsed
  }
  if (logId && schoolId) {
    pool.query(`UPDATE payment_webhook_log SET school_id = $1 WHERE id = $2`, [schoolId, logId]).catch(() => {})
  }

  // Verify HMAC-SHA256 signature
  const signature = req.headers.get('x-webhook-signature') ?? ''
  const timestamp = req.headers.get('x-webhook-timestamp') ?? ''
  let signatureValid = false

  if (schoolId && signature && timestamp) {
    try {
      const cfgRes = await pool.query(
        `SELECT cashfree_secret_encrypted FROM school_payment_config WHERE school_id = $1 AND is_active = true`,
        [schoolId]
      )
      if (cfgRes.rows.length > 0) {
        const secretKey = decrypt(cfgRes.rows[0].cashfree_secret_encrypted)
        const expected  = createHmac('sha256', secretKey).update(timestamp + rawBody).digest('base64')
        signatureValid  = expected === signature
      }
    } catch (err) {
      console.error('[webhook/cashfree] signature error:', err)
    }
  }

  if (logId) {
    pool.query(`UPDATE payment_webhook_log SET signature_valid = $1 WHERE id = $2`, [signatureValid, logId]).catch(() => {})
  }

  if (!signatureValid) {
    return NextResponse.json({ received: true, processed: false, reason: 'signature_invalid' })
  }

  // Idempotency check
  const dupCheck = await pool.query(
    `SELECT id FROM payment_webhook_log WHERE cashfree_order_id = $1 AND event_type = $2 AND processed = true AND id != $3 LIMIT 1`,
    [orderId, eventType, logId ?? 0]
  )
  if (dupCheck.rows.length > 0) {
    if (logId) pool.query(`UPDATE payment_webhook_log SET processed = true, processing_error = 'duplicate_skipped' WHERE id = $1`, [logId]).catch(() => {})
    return NextResponse.json({ received: true, processed: false, reason: 'duplicate' })
  }

  if (eventType === 'PAYMENT_SUCCESS' && orderId) {
    try {
      await processPaymentSuccess(orderId, schoolId, payload, logId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[webhook/cashfree] processing error:', msg)
      if (logId) pool.query(`UPDATE payment_webhook_log SET processing_error = $1 WHERE id = $2`, [msg.slice(0, 500), logId]).catch(() => {})
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
  } else if (eventType === 'PAYMENT_FAILED' && orderId) {
    await handlePaymentFailed(orderId, payload, logId)
  }

  return NextResponse.json({ received: true, processed: true })
}

async function processPaymentSuccess(
  orderId: string,
  schoolId: number | null,
  payload: Record<string, unknown>,
  logId: number | null
) {
  const data       = payload.data as Record<string, unknown>
  const paymentId  = (data?.payment as Record<string, unknown>)?.cf_payment_id as string ?? ''
  const paidAmount = Number((data?.payment as Record<string, unknown>)?.payment_amount ?? 0)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const txnRes = await client.query(
      `SELECT id, school_id, student_id, ledger_ids, amount, status, parent_phone, parent_name
       FROM payment_transactions WHERE cashfree_order_id = $1`,
      [orderId]
    )
    if (txnRes.rows.length === 0) throw new Error(`Transaction not found: ${orderId}`)

    const txn = txnRes.rows[0]
    if (schoolId && txn.school_id !== schoolId) throw new Error(`School ID mismatch`)
    if (txn.status === 'PAID') {
      await client.query('ROLLBACK')
      if (logId) pool.query(`UPDATE payment_webhook_log SET processed = true WHERE id = $1`, [logId]).catch(() => {})
      return
    }

    const schoolCode = String(txn.school_id).padStart(3, '0')
    const year  = new Date().getFullYear()
    const today = new Date().toISOString().slice(0, 10)

    const ledgerRes = await client.query(
      `SELECT id, amount_due, amount_paid, COALESCE(waiver_amount,0) AS waiver_amount
       FROM student_fee_ledger
       WHERE id = ANY($1) AND school_id = $2 AND status NOT IN ('paid','waived')
       ORDER BY due_date ASC`,
      [txn.ledger_ids, txn.school_id]
    )

    let remaining = paidAmount > 0 ? paidAmount : Number(txn.amount)
    let firstReceiptNumber = ''

    for (const entry of ledgerRes.rows) {
      if (remaining <= 0) break
      const balance = Number(entry.amount_due) - Number(entry.waiver_amount) - Number(entry.amount_paid)
      if (balance <= 0) continue
      const allocate = Math.min(remaining, balance)
      remaining -= allocate

      const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
      const receiptNumber = `RCP-${schoolCode}-${year}-${String(seq.n).padStart(6, '0')}`
      if (!firstReceiptNumber) firstReceiptNumber = receiptNumber

      await client.query(
        `INSERT INTO fee_payments
           (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
            receipt_number, transaction_ref, paid_date, collected_by_name)
         VALUES ($1,$2,$3,$4,'online','completed',$5,$6,$7,'Online (Cashfree)')`,
        [txn.school_id, txn.student_id, entry.id, allocate.toFixed(2), receiptNumber, paymentId || orderId, today]
      )

      await client.query(
        `UPDATE student_fee_ledger
         SET amount_paid = LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1),
             status = CASE
               WHEN LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) >= (amount_due - COALESCE(waiver_amount,0)) THEN 'paid'
               WHEN amount_paid + $1 > 0 THEN 'partial'
               ELSE status
             END
         WHERE id = $2`,
        [allocate.toFixed(2), entry.id]
      )
    }

    await client.query(
      `UPDATE payment_transactions SET status='PAID', cashfree_payment_id=$1, webhook_received_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [paymentId || null, txn.id]
    )

    await client.query('COMMIT')
    if (logId) pool.query(`UPDATE payment_webhook_log SET processed = true WHERE id = $1`, [logId]).catch(() => {})

    if (firstReceiptNumber) {
      sendWhatsAppReceiptAfterPayment(txn, firstReceiptNumber, paidAmount > 0 ? paidAmount : Number(txn.amount)).catch(() => {})
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function sendWhatsAppReceiptAfterPayment(
  txn: { school_id: number; student_id: number; parent_phone: string | null; parent_name: string | null },
  receiptNumber: string,
  amount: number
) {
  try {
    const cfgRes = await pool.query(
      `SELECT access_token_encrypted, phone_number_id, payment_receipt_template, is_active
       FROM school_whatsapp_config WHERE school_id = $1 AND is_active = true`,
      [txn.school_id]
    )
    if (cfgRes.rows.length === 0) return
    const cfg = cfgRes.rows[0]
    if (!cfg.payment_receipt_template || !cfg.phone_number_id || !txn.parent_phone) return

    let accessToken: string
    try { accessToken = decrypt(cfg.access_token_encrypted) } catch { return }

    const stuRes = await pool.query(`SELECT name FROM students WHERE id = $1`, [txn.student_id])
    const studentName = stuRes.rows[0]?.name || ''
    const phoneNumber = '91' + txn.parent_phone.replace(/\D/g, '').slice(-10)
    const amountStr   = `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

    const result = await sendWhatsAppTemplate(accessToken, cfg.phone_number_id, {
      phoneNumber,
      templateName: cfg.payment_receipt_template,
      languageCode: 'en',
      bodyParams: [studentName, amountStr, receiptNumber, 'Fee'],
      callbackData: `${txn.school_id}:payment_receipt`,
    })

    const status = result.error ? 'failed' : 'sent'
    await pool.query(
      `INSERT INTO whatsapp_messages
         (school_id, recipient_phone, recipient_name, message_type, template_name,
          template_params, provider, provider_message_id, status, failure_reason, sent_at, created_at)
       VALUES ($1,$2,$3,'payment_receipt',$4,$5,'meta',$6,$7,$8,$9,NOW())`,
      [txn.school_id, phoneNumber, txn.parent_name || null, cfg.payment_receipt_template,
       JSON.stringify({ bodyParams: [studentName, amountStr, receiptNumber, 'Fee'] }),
       result.messageId || null, status, result.error || null, status === 'sent' ? new Date() : null]
    )

    const yearMonth = new Date().toISOString().slice(0, 7)
    await pool.query(
      `INSERT INTO whatsapp_usage_summary (school_id, year_month, message_type, sent_count, delivered_count, failed_count)
       VALUES ($1,$2,'payment_receipt',$3,0,$4)
       ON CONFLICT (school_id, year_month, message_type) DO UPDATE SET
         sent_count   = whatsapp_usage_summary.sent_count   + $3,
         failed_count = whatsapp_usage_summary.failed_count + $4`,
      [txn.school_id, yearMonth, status === 'sent' ? 1 : 0, status === 'failed' ? 1 : 0]
    )
  } catch (err) {
    console.error('[webhook/cashfree] WhatsApp receipt error:', err)
  }
}

async function handlePaymentFailed(
  orderId: string,
  payload: Record<string, unknown>,
  logId: number | null
) {
  const data          = payload.data as Record<string, unknown>
  const failureReason = (data?.error_details as Record<string, unknown>)?.error_description as string ?? 'Payment failed'

  await pool.query(
    `UPDATE payment_transactions SET status='FAILED', failure_reason=$1, webhook_received_at=NOW(), updated_at=NOW() WHERE cashfree_order_id=$2`,
    [failureReason.slice(0, 500), orderId]
  )

  if (logId) pool.query(`UPDATE payment_webhook_log SET processed = true WHERE id = $1`, [logId]).catch(() => {})
}
