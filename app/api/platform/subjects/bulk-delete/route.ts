import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// POST /api/platform/subjects/bulk-delete
// body: { ids: number[] }
//
// Deletes several master subjects in one call — the curriculum admin sidebar
// only had per-subject delete before, which was slow when cleaning up
// duplicates. Cascades to chapters/topics/resources/tasks same as the
// existing single-delete routes.
export async function POST(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isFinite(Number(id)))) {
      return NextResponse.json({ error: 'ids (non-empty array of numbers) is required' }, { status: 400 })
    }

    const { rowCount } = await pool.query('DELETE FROM master_subjects WHERE id = ANY($1::int[])', [ids])
    return NextResponse.json({ ok: true, deleted: rowCount })
  } catch (err) {
    console.error('Platform subjects bulk-delete POST error:', err)
    return NextResponse.json({ error: 'Failed to delete master subjects' }, { status: 500 })
  }
}
