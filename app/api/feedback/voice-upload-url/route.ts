import { createHash, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { getClientIp } from '@/lib/request-ip'
import { resolveActiveFeedbackSchool } from '@/lib/feedback-public-access'
import { feedbackVoiceUploadUrlSchema } from '@/lib/validation/feedback'

const RATE_LIMIT_WINDOW = '10 minutes'
const RATE_LIMIT_MAX = 10

// POST /api/feedback/voice-upload-url
// Body: { code }
//
// Public, code-gated (same trust model as GET /api/feedback/resolve) — mints
// a short-lived presigned PUT URL so the browser can upload a voice note
// directly to R2 without ever holding a session. The returned `key` is
// namespaced under feedback/{school_id}/ so POST /api/feedback/submit can
// cheaply verify a submitted voice_key actually belongs to the resolved
// school before accepting it.
export async function POST(req: NextRequest) {
  try {
    const parsed = feedbackVoiceUploadUrlSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const resolved = await resolveActiveFeedbackSchool(pool, parsed.data.code)
    if (!resolved) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    // Rate limit — this route is unauthenticated and mints a real presigned
    // R2 PUT URL, so without a cap an attacker could mint unlimited upload
    // URLs and push arbitrary files to storage without ever calling submit.
    const ip = getClientIp(req)
    const ipHash = createHash('sha256').update(`${ip}:${process.env.JWT_SECRET ?? ''}`).digest('hex')
    const { rows: [{ count }] } = await pool.query(
      `SELECT count(*) FROM feedback_voice_upload_log
       WHERE school_id = $1 AND ip_hash = $2 AND created_at > now() - interval '${RATE_LIMIT_WINDOW}'`,
      [resolved.schoolId, ipHash]
    )
    if (Number(count) >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Too many upload attempts, please try again later' }, { status: 429 })
    }
    await pool.query(
      `INSERT INTO feedback_voice_upload_log (school_id, ip_hash) VALUES ($1, $2)`,
      [resolved.schoolId, ipHash]
    )

    const key = `feedback/${resolved.schoolId}/${randomUUID()}.webm`
    const r2 = r2Config()
    const uploadUrl = await getSignedUrl(
      r2.client,
      new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: 'audio/webm' }),
      { expiresIn: 300 }
    )

    return NextResponse.json({ uploadUrl, key })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
