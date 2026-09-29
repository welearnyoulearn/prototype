import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import fs from 'fs/promises'
import { requireSchoolAdmin } from '@/lib/auth'

// DELETE /api/textbooks/[id] — school admins only; the school comes from the session
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSchoolAdmin()
    if (!admin?.schoolId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const raw = req.nextUrl.searchParams.get('school_id')
    if (raw !== null && Number(raw) !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const school_id = admin.schoolId
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    await ensureDB()
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
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
