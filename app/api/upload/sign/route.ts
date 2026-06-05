import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { ensureDB } from '@/lib/db'
import { getAnySession } from '@/lib/auth'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 })
    }

    const { folder = 'task-submissions', public_id } = await req.json()

    const timestamp = Math.round(Date.now() / 1000)
    const params: Record<string, string | number> = { timestamp, folder }
    if (public_id) params.public_id = public_id

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET)

    return NextResponse.json({
      signature,
      timestamp,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      folder,
      ...(public_id ? { public_id } : {}),
    })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
