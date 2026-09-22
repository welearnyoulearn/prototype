import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Config } from '@/lib/r2'

// GET /api/avatars/file?key=avatars/xxx/photo.webp
//
// Mirrors /api/materials/file — mints a short-lived presigned GET URL for the
// requested key and redirects to it, so the DB just stores a stable link
// (/api/avatars/file?key=...) instead of a URL that would otherwise expire.
// Unauthenticated by design: knowing the key is the only gate, same as the
// existing materials-file route.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key || !key.startsWith('avatars/')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }
  try {
    const r2 = r2Config()
    const url = await getSignedUrl(
      r2.client,
      new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
      { expiresIn: 3600 },
    )
    return NextResponse.redirect(url)
  } catch (err) {
    console.error('avatars file GET error:', err)
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
  }
}
