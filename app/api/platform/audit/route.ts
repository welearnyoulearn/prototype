import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

  try {
    const result = await pool.query(`
      SELECT
        l.id, l.action, l.entity_type, l.entity_id, l.entity_name,
        l.details, l.created_at,
        u.email AS actor_email
      FROM platform_audit_log l
      LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset])

    const countRes = await pool.query('SELECT COUNT(*) FROM platform_audit_log')

    return NextResponse.json({
      logs: result.rows,
      total: parseInt(countRes.rows[0].count),
    })
  } catch (error) {
    console.error('[platform/audit]', error)
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 })
  }
}
