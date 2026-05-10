import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import fs from 'fs/promises'

// DELETE /api/textbooks/[id]?school_id=
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const { id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows: [lib] } = await pool.query(
      `SELECT file_path FROM textbook_library WHERE id=$1 AND school_id=$2`,
      [id, school_id],
    )
    if (!lib) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Delete file from disk (best-effort)
    if (lib.file_path) fs.unlink(lib.file_path).catch(() => {})

    // Cascade deletes chunks via FK
    await pool.query(`DELETE FROM textbook_library WHERE id=$1 AND school_id=$2`, [id, school_id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('textbooks DELETE error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
