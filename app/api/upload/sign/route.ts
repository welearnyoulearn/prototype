import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { requireSchoolAdmin, requirePlatformAdmin } from '@/lib/auth'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Which folders each role may sign an upload for. The client names the PURPOSE (`folder`);
// the server decides the actual folder and public_id, so a signature can never be used to
// write into another school's folder or to overwrite an arbitrary existing asset.
// Nothing else is signable — teachers, students and parents have no upload flow that uses this.
type Target = { folder: string; public_id?: string }
const SCHOOL_TARGETS: Record<string, (schoolId: number) => Target> = {
  // Settings → school logo: one fixed asset per school, overwritten on re-upload
  'school-logos':  schoolId => ({ folder: 'school-logos', public_id: `school-${schoolId}` }),
  // Expenses → bill attachments, kept per school
  'expense-bills': schoolId => ({ folder: `expense-bills/school-${schoolId}` }),
}
const PLATFORM_FOLDERS = new Set(['curriculum-resources', 'textbooks', 'attachments'])

export async function POST(req: NextRequest) {
  try {
    // A platform admin is checked first, so a browser holding both logins signs for the platform.
    const platform = await requirePlatformAdmin()
    const school   = platform ? null : await requireSchoolAdmin()
    if (!platform && !school?.schoolId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({})) as { folder?: unknown }
    const purpose = typeof body.folder === 'string' ? body.folder : ''

    let target: Target
    if (platform) {
      if (!PLATFORM_FOLDERS.has(purpose)) return NextResponse.json({ error: 'Upload folder not allowed' }, { status: 403 })
      target = { folder: purpose }
    } else {
      const make = SCHOOL_TARGETS[purpose]
      if (!make) return NextResponse.json({ error: 'Upload folder not allowed' }, { status: 403 })
      target = make(school!.schoolId!)
    }

    const timestamp = Math.round(Date.now() / 1000)
    const params: Record<string, string | number> = { timestamp, folder: target.folder }
    if (target.public_id) params.public_id = target.public_id

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET)

    return NextResponse.json({
      signature,
      timestamp,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      folder: target.folder,
      ...(target.public_id ? { public_id: target.public_id } : {}),
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
