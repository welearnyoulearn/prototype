import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// DELETE /api/platform/subjects/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await pool.query('DELETE FROM master_subjects WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform dynamic subject DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master subject' }, { status: 500 })
  }
}
