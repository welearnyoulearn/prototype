import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'

// GET /api/whatsapp/usage?school_id=X
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const enabled = await schoolHasFeature(access.schoolId, 'whatsapp')
    if (!enabled) return NextResponse.json({ error: 'WhatsApp not enabled' }, { status: 403 })

    const yearMonth = new Date().toISOString().slice(0, 7)

    const { rows } = await pool.query(
      `SELECT message_type,
              SUM(sent_count) AS sent_count,
              SUM(delivered_count) AS delivered_count,
              SUM(failed_count) AS failed_count
       FROM whatsapp_usage_summary
       WHERE school_id = $1 AND year_month = $2
       GROUP BY message_type`,
      [access.schoolId, yearMonth]
    )

    const total_sent = rows.reduce((s, r) => s + Number(r.sent_count), 0)
    const by_type = rows.reduce((acc: Record<string, number>, r) => {
      acc[r.message_type] = Number(r.sent_count)
      return acc
    }, {})

    return NextResponse.json({ year_month: yearMonth, total_sent, by_type })
  } catch (err) {
    console.error('[whatsapp/usage]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
