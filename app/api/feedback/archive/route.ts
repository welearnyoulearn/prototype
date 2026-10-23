import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackSourceFilter, olderThanFilter } from '@/lib/feedback-source'
import { feedbackArchiveSchema } from '@/lib/validation/feedback'

// GET /api/feedback/archive?school_id=&source=&older_than_days=
// Preview for the Clear folder / Archive dialogs: how many submissions (and
// open issues) a given folder + age cut-off covers, plus the date span.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const school_id = sp.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params: unknown[] = [access.schoolId]
    const src = feedbackSourceFilter(sp.get('source'), 's', params)
    const older = olderThanFilter(sp.get('older_than_days'), 's', params)
    if (src === null || older === null) return NextResponse.json({ error: 'Invalid filter' }, { status: 400 })

    const { rows: [row] } = await pool.query(
      `SELECT COUNT(*)::int AS count,
              MIN(s.created_at) AS oldest, MAX(s.created_at) AS newest,
              (SELECT COUNT(*) FROM feedback_submission_ratings r JOIN feedback_submissions s ON s.id = r.submission_id
               WHERE s.school_id = $1 ${src}${older} AND r.priority IS NOT NULL AND r.status = 'open')::int AS open_issues
       FROM feedback_submissions s WHERE s.school_id = $1 ${src}${older}`,
      params
    )
    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/feedback/archive — Body: { school_id, action, source, older_than_days? }
//   archive — Clear folder: move a live folder's submissions (optionally only
//             older than N days) into the Archive. Nothing is deleted.
//   restore — move archived submissions back to their original folders
//   purge   — permanently delete archived submissions (+ their ratings/issues
//             via cascade, voice notes from R2 best-effort)
// restore/purge only ever touch source 'archived'; archive never does.
export async function POST(req: NextRequest) {
  try {
    const parsed = feedbackArchiveSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { action, source, older_than_days } = parsed.data

    const access = await requireFeeAccess(parsed.data.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (action === 'archive' ? source === 'archived' : source !== 'archived') {
      return NextResponse.json({ error: action === 'archive' ? 'Already archived' : 'Only archived feedback can be restored or deleted' }, { status: 400 })
    }

    const params: unknown[] = [access.schoolId]
    const src = feedbackSourceFilter(source, 's', params)
    const older = olderThanFilter(older_than_days ?? null, 's', params)
    if (src === null || older === null) return NextResponse.json({ error: 'Invalid filter' }, { status: 400 })
    const where = `s.school_id = $1 ${src}${older}`

    if (action === 'archive') {
      const { rowCount } = await pool.query(`UPDATE feedback_submissions s SET archived_at = now() WHERE ${where}`, params)
      return NextResponse.json({ ok: true, count: rowCount ?? 0 })
    }
    if (action === 'restore') {
      const { rowCount } = await pool.query(`UPDATE feedback_submissions s SET archived_at = NULL WHERE ${where}`, params)
      return NextResponse.json({ ok: true, count: rowCount ?? 0 })
    }

    // purge — one statement, so it is atomic without a dedicated client
    const { rows } = await pool.query(`DELETE FROM feedback_submissions s WHERE ${where} RETURNING s.voice_object_key`, params)
    const voiceKeys = rows.map(r => r.voice_object_key).filter((k): k is string => !!k && k.startsWith(`feedback/${access.schoolId}/`))
    if (voiceKeys.length > 0) {
      const r2 = r2Config()
      await Promise.all(voiceKeys.map(key =>
        r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }))
          .catch(err => console.error('[feedback] voice note R2 delete failed', key, err))
      ))
    }
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
