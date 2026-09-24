import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/data-export/log?school_id=
// Who downloaded what and when (the latest 100). Exports contain personal data of students, parents and
// staff, so every download is recorded.
export async function GET(req: NextRequest) {
  try {
    const access = await requireFeeAccess(req.nextUrl.searchParams.get('school_id'))
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { rows } = await pool.query(
      `SELECT id, export_key, format, filters, row_count, by_name, created_at
       FROM data_export_log WHERE school_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [access.schoolId])
    return NextResponse.json(rows)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
