import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { r2Config } from '@/lib/r2'

// Subject materials are stored as /api/materials/file?key=materials/... —
// pull the raw R2 key back out so the object can be deleted alongside the
// DB row. Anything that doesn't parse is skipped rather than thrown on, so
// one bad file_url never blocks the subject delete itself.
function r2KeyFromFileUrl(fileUrl: string): string | null {
  try {
    const key = new URL(fileUrl, 'http://x').searchParams.get('key')
    return key && key.startsWith('materials/') ? key : null
  } catch {
    return null
  }
}

// DELETE /api/platform/subjects/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Materials must be read before the delete — master_subject_materials
    // cascade-deletes with the subject, so this is the last chance to know
    // which R2 objects belonged to it.
    const { rows: materials } = await pool.query(
      'SELECT file_url FROM master_subject_materials WHERE subject_id = $1',
      [id]
    )
    await pool.query('DELETE FROM master_subjects WHERE id = $1', [id])

    const keys = materials
      .map((m: { file_url: string }) => r2KeyFromFileUrl(m.file_url))
      .filter((k: string | null): k is string => k !== null)
    if (keys.length > 0) {
      try {
        const r2 = r2Config()
        await r2.client.send(new DeleteObjectsCommand({
          Bucket: r2.bucket,
          Delete: { Objects: keys.map(Key => ({ Key })) },
        }))
      } catch (err) {
        // The subject is already gone from the DB at this point — log and
        // report success rather than leaving the admin stuck on an orphaned
        // R2 cleanup failure they can't retry through this same delete.
        console.error('Platform dynamic subject DELETE: R2 cleanup failed:', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform dynamic subject DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master subject' }, { status: 500 })
  }
}
