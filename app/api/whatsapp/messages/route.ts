import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'

// GET /api/whatsapp/messages?school_id=X&message_type=X&status=X&page=1
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const school_id = params.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'whatsapp')
    if (!enabled) return NextResponse.json({ error: 'WhatsApp not enabled' }, { status: 403 })

    const message_type = params.get('message_type')
    const status       = params.get('status')
    const page         = Math.max(1, parseInt(params.get('page') || '1'))
    const limit        = 50
    const offset       = (page - 1) * limit

    const conditions: string[] = ['school_id = $1']
    const values: (string | number)[] = [access.schoolId]
    let idx = 2

    if (message_type) { conditions.push(`message_type = $${idx++}`); values.push(message_type) }
    if (status)       { conditions.push(`status = $${idx++}`);       values.push(status) }

    const where = conditions.join(' AND ')

    const { rows } = await pool.query(
      `SELECT id, recipient_phone, recipient_name, message_type, template_name,
              status, failure_reason, sent_at, delivered_at, read_at, created_at
       FROM whatsapp_messages
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values
    )

    return NextResponse.json({ messages: rows, page, limit })
  } catch (err) {
    console.error('[whatsapp/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
