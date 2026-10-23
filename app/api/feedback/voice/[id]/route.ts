import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/voice/[id] — [id] is a feedback_submissions.id
//
// Unlike /api/materials/file (intentionally public — "knowing the key is the
// gate"), voice notes are personally identifying even on an anonymous
// submission, so this route requires a school-staff session tenant-matched
// to the submission's school before minting a short-lived presigned GET.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [submission] } = await pool.query(
      `SELECT school_id, voice_object_key FROM feedback_submissions WHERE id = $1`,
      [id]
    )
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(submission.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!submission.voice_object_key) return NextResponse.json({ error: 'No voice note' }, { status: 404 })

    const r2 = r2Config()
    const url = await getSignedUrl(
      r2.client,
      new GetObjectCommand({ Bucket: r2.bucket, Key: submission.voice_object_key }),
      { expiresIn: 900 }
    )
    return NextResponse.redirect(url)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
