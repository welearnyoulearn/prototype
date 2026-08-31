import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { getFieldConfig } from '@/lib/feedbackFieldsServer'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// No auth required — this signs uploads for the anonymous public feedback form.
// Unlike every other upload path in this app (app/api/upload/sign), this one is
// necessarily public since there's no session. Kept as narrow as an open relay
// can reasonably be: image-only Cloudinary endpoint, restricted formats,
// per-school folder, and refuses to sign anything for a school that hasn't
// turned the photo field on. No rate limiting (see DOCS/KNOWN_ISSUES.md).
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp'

const SignSchema = z.object({
  school_id: z.coerce.number().int().positive(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  }
  const { school_id } = parsed.data

  if (!process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ error: 'Photo upload is not set up yet.' }, { status: 500 })
  }

  try {
    const { rows: [school] } = await pool.query(
      `SELECT id, status FROM schools WHERE id = $1`, [school_id]
    )
    if (!school || school.status !== 'active') {
      return NextResponse.json({ error: 'school_not_found' }, { status: 404 })
    }
    if (!(await schoolHasFeature(school_id, 'school-feedback'))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const fields = await getFieldConfig(school_id)
    if (!fields.photo.enabled) {
      return NextResponse.json({ error: 'photo_uploads_disabled' }, { status: 403 })
    }

    const folder = `feedback/${school_id}`
    const timestamp = Math.round(Date.now() / 1000)
    const params = { timestamp, folder, allowed_formats: ALLOWED_FORMATS }
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET)

    return NextResponse.json({
      signature,
      timestamp,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      folder,
      allowed_formats: ALLOWED_FORMATS,
    })
  } catch (err) {
    console.error('POST /api/feedback/upload-sign error:', err)
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 })
  }
}
