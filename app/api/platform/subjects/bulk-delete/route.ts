import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { r2Config } from '@/lib/r2'

function r2KeyFromFileUrl(fileUrl: string): string | null {
  try {
    const key = new URL(fileUrl, 'http://x').searchParams.get('key')
    return key && key.startsWith('materials/') ? key : null
  } catch {
    return null
  }
}

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

    // Materials must be read before the delete — master_subject_materials
    // cascade-deletes with its subject, so this is the last chance to know
    // which R2 objects belonged to these subjects.
    const { rows: materials } = await pool.query(
      'SELECT file_url FROM master_subject_materials WHERE subject_id = ANY($1::int[])',
      [ids]
    )
    const { rowCount } = await pool.query('DELETE FROM master_subjects WHERE id = ANY($1::int[])', [ids])

    const keys = materials
      .map((m: { file_url: string }) => r2KeyFromFileUrl(m.file_url))
      .filter((k: string | null): k is string => k !== null)
    if (keys.length > 0) {
      try {
        const r2 = r2Config()
        // R2's DeleteObjects caps at 1000 keys per call.
        for (let i = 0; i < keys.length; i += 1000) {
          const batch = keys.slice(i, i + 1000)
          await r2.client.send(new DeleteObjectsCommand({
            Bucket: r2.bucket,
            Delete: { Objects: batch.map(Key => ({ Key })) },
          }))
        }
      } catch (err) {
        console.error('Platform subjects bulk-delete: R2 cleanup failed:', err)
      }
    }

    return NextResponse.json({ ok: true, deleted: rowCount })
  } catch (err) {
    console.error('Platform subjects bulk-delete POST error:', err)
    return NextResponse.json({ error: 'Failed to delete master subjects' }, { status: 500 })
  }
}
