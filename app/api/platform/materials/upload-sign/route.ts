import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Config } from '@/lib/r2'
import { requirePlatformAdmin } from '@/lib/auth'

// POST /api/platform/materials/upload-sign
// body: { filename: string, content_type?: string }
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
    const { filename, content_type } = await req.json()
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    }

    const r2 = r2Config()
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `materials/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

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
