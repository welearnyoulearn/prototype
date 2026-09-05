import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { requirePlatformAdmin } from '@/lib/auth'

function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'UNKNOWN'
}

// POST /api/platform/materials/upload-sign
// body: { filename: string, content_type?: string, subject_id?: number }
//
// Textbook/handbook PDFs regularly exceed Cloudinary's free-tier 10MB cap
// (some of these scanned textbooks run 50-80MB), so subject materials go to
// Cloudflare R2 instead — already configured for DB backups in this project,
// free up to 10GB, and with no small per-file ceiling. Returns a short-lived
// presigned PUT URL the browser uploads directly to (bypassing our server,
// so there's no Vercel function body-size limit either), plus the object
// key to store and later serve via /api/materials/file.
export async function POST(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { filename, content_type, subject_id } = await req.json()
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    }

    // subject_id (when supplied) files the object under
    // materials/{board}/grade-{grade}/{subject}/ instead of a flat prefix —
    // looked up server-side rather than trusting client-supplied board/grade
    // strings. Falls back to the flat prefix when no subject context exists
    // yet (or the id doesn't resolve), same as every file uploaded before
    // this folder structure existed.
    let folderPrefix = 'materials/'
    if (subject_id) {
      const { rows } = await pool.query(
        'SELECT board, grade, subject_name FROM master_subjects WHERE id = $1',
        [subject_id]
      )
      if (rows.length > 0) {
        const { board, grade, subject_name } = rows[0]
        folderPrefix = `materials/${sanitizeSegment(board)}/grade-${sanitizeSegment(grade)}/${sanitizeSegment(subject_name)}/`
      }
    }

    const r2 = r2Config()
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `${folderPrefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

    const uploadUrl = await getSignedUrl(
      r2.client,
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        ContentType: typeof content_type === 'string' && content_type ? content_type : 'application/pdf',
      }),
      { expiresIn: 600 },
    )

    return NextResponse.json({ uploadUrl, key })
  } catch (err) {
    console.error('materials upload-sign POST error:', err)
    const message = err instanceof Error && err.message.startsWith('R2 not configured')
      ? err.message
      : 'Failed to prepare upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
