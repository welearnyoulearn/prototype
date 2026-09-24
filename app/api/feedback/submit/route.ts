import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { getClientIp } from '@/lib/request-ip'
import { resolveActiveFeedbackSchool } from '@/lib/feedback-public-access'
import { feedbackSubmitSchema } from '@/lib/validation/feedback'

const RATE_LIMIT_WINDOW = '10 minutes'
const RATE_LIMIT_MAX = 5

// rating 1 -> high priority issue, 2 -> medium, 3-5 -> not an issue (null)
function priorityForRating(rating: number): 'high' | 'medium' | null {
  if (rating === 1) return 'high'
  if (rating === 2) return 'medium'
  return null
}

// POST /api/feedback/submit
// Body: { code, role, is_anonymous, name?, phone?, quick_picks?, free_text?, voice_key?,
//         ratings?:[{category_key,rating}], advanced_form_type?, advanced_form_data? }
// Exactly one of ratings / advanced_form_type must be present.
//
// Public, unauthenticated — the whole point of a QR-code feedback poster.
// `code` resolves the school (feedback_settings.public_code); every other
// identifier in the payload is either school-scoped-and-verified
// (voice_key) or free-form user content (name/phone/free_text).
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const parsed = feedbackSubmitSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    }
    const body = parsed.data
    const ratings = body.ratings ?? []

    // Every submission is either category ratings OR an Advanced Form
    // (Meeting/Event/Exam/Academic) — never neither, never both.
    if (ratings.length === 0 && !body.advanced_form_type) {
      return NextResponse.json({ error: 'ratings or advanced_form_type is required' }, { status: 400 })
    }
    if (ratings.length > 0 && body.advanced_form_type) {
      return NextResponse.json({ error: 'Cannot submit both ratings and an advanced form' }, { status: 400 })
    }

    const resolved = await resolveActiveFeedbackSchool(client, body.code)
    if (!resolved) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const schoolId = resolved.schoolId

    const duplicateKeys = ratings.map(r => r.category_key).filter((k, i, arr) => arr.indexOf(k) !== i)
    if (duplicateKeys.length > 0) {
      return NextResponse.json({ error: `Duplicate rating for category: ${duplicateKeys[0]}` }, { status: 400 })
    }

    // Rate limit: same IP hammering the same school's form.
    const ip = getClientIp(req)
    const ipHash = createHash('sha256').update(`${ip}:${process.env.JWT_SECRET ?? ''}`).digest('hex')
    const { rows: [{ count }] } = await client.query(
      `SELECT count(*) FROM feedback_submissions
       WHERE school_id = $1 AND ip_hash = $2 AND created_at > now() - interval '${RATE_LIMIT_WINDOW}'`,
      [schoolId, ipHash]
    )
    if (Number(count) >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Too many submissions, please try again later' }, { status: 429 })
    }

    // Anonymous suppresses identity server-side regardless of what the
    // client payload contained — this is the actual enforcement point.
    const submitterName = body.is_anonymous ? null : (body.name || null)
    const submitterPhone = body.is_anonymous ? null : (body.phone || null)

    // A voice note must belong to this school's R2 prefix and must actually
    // exist — prevents a client passing another school's key or a
    // never-uploaded one.
    let voiceKey: string | null = null
    if (body.voice_key) {
      if (!body.voice_key.startsWith(`feedback/${schoolId}/`)) {
        return NextResponse.json({ error: 'Invalid voice_key' }, { status: 400 })
      }
      try {
        const r2 = r2Config()
        await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: body.voice_key }))
        voiceKey = body.voice_key
      } catch {
        return NextResponse.json({ error: 'Voice recording not found — please re-record and try again' }, { status: 400 })
      }
    }

    // Resolve each rated category against this school's live category rows
    // so category_label/department are accurate snapshots, and to reject a
    // category_key that doesn't belong to this school. Skipped entirely for
    // an Advanced Form submission, which has no categories to resolve.
    let byKey = new Map<string, { id: number; key: string; label: string; department: string | null }>()
    if (ratings.length > 0) {
      const categoryKeys = ratings.map(r => r.category_key)
      const { rows: categories } = await client.query(
        `SELECT id, key, label, department FROM feedback_categories
         WHERE school_id = $1 AND role = $2 AND key = ANY($3::text[]) AND is_active = TRUE`,
        [schoolId, body.role, categoryKeys]
      )
      byKey = new Map(categories.map(c => [c.key, c]))
      const unknown = categoryKeys.filter(k => !byKey.has(k))
      if (unknown.length > 0) {
        return NextResponse.json({ error: `Unknown category: ${unknown.join(', ')}` }, { status: 400 })
      }
    }

    await client.query('BEGIN')

    const { rows: [submission] } = await client.query(
      `INSERT INTO feedback_submissions
         (school_id, role, is_anonymous, submitter_name, submitter_phone, quick_pick_tags, free_text, voice_object_key, ip_hash, advanced_form_type, advanced_form_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, created_at`,
      [
        schoolId, body.role, body.is_anonymous, submitterName, submitterPhone,
        body.quick_picks?.join(',') || null, body.free_text || null, voiceKey, ipHash,
        body.advanced_form_type || null, body.advanced_form_data ? JSON.stringify(body.advanced_form_data) : null,
      ]
    )

    if (ratings.length > 0) {
      // Single multi-row insert rather than one round-trip per rating —
      // this is a public, unauthenticated hot path (every QR scan hits it).
      const ratingParams: unknown[] = []
      const ratingRows = ratings.map(r => {
        const cat = byKey.get(r.category_key)!
        const i = ratingParams.length
        ratingParams.push(submission.id, schoolId, cat.id, cat.key, cat.label, cat.department, r.rating, priorityForRating(r.rating))
        return `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8})`
      })
      await client.query(
        `INSERT INTO feedback_submission_ratings
           (submission_id, school_id, category_id, category_key, category_label, department, rating, priority)
         VALUES ${ratingRows.join(', ')}`,
        ratingParams
      )
    }

    await client.query('COMMIT')

    return NextResponse.json({ id: submission.id, created_at: submission.created_at }, { status: 201 })
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    client.release()
  }
}
