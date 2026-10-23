import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { r2Config } from '@/lib/r2'

// DELETE /api/platform/materials/[id]
//
// Also deletes the underlying file from R2 — file_url is stored as
// /api/materials/file?key=materials/<...>, so the object key is recovered
// from that query param before the DB row goes away. Without this, every
// deleted material orphaned its PDF in R2 forever (never cleaned up by
// anything else in this codebase), quietly growing storage cost. The R2
// delete runs first: if it fails, the DB row (and therefore the file_url
// pointing at the object) is left intact rather than silently losing the
// only reference to a file that's still sitting in the bucket.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { rows } = await pool.query('SELECT file_url FROM master_subject_materials WHERE id = $1', [id])
    if (rows.length === 0) return NextResponse.json({ error: 'Material not found' }, { status: 404 })

    const fileUrl = rows[0].file_url as string
    const key = fileUrl?.startsWith('/api/materials/file?')
      ? new URL(fileUrl, 'http://localhost').searchParams.get('key')
      : null

    if (key && key.startsWith('materials/')) {
      try {
        const r2 = r2Config()
        await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }))
      } catch (err) {
        console.error('Platform material R2 delete error:', err)
        return NextResponse.json({ error: 'Failed to delete file from storage' }, { status: 500 })
      }
    }

    await pool.query('DELETE FROM master_subject_materials WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform material DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete material' }, { status: 500 })
  }
}
