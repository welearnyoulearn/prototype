import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Config } from '@/lib/r2'

// GET /api/materials/file?key=materials/xxx.pdf
//
// Subject materials (textbooks/handbooks) live in R2, not publicly on the
// bucket — this mints a short-lived presigned GET URL for the requested key
// and redirects to it, so the DB just stores a stable link
// (/api/materials/file?key=...) instead of a URL that would otherwise expire.
// Unauthenticated by design: knowing the key is the only gate, matching the
// existing Cloudinary URLs stored in this same column (also unauthenticated
// if you have the link).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key || !key.startsWith('materials/')) {
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
    console.error('materials file GET error:', err)
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
  }
}
