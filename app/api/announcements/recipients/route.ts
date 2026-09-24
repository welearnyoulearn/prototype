import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireFeeAccess } from '@/lib/auth'
import { computeRecipients } from '@/lib/announcementAudience'
import { normaliseAudience, normaliseClasses, type TargetClass } from '@/lib/announcements'

const classesParam = z.array(z.object({ grade: z.string().min(1).max(20), section: z.string().min(1).max(10).nullable() })).max(300)

// GET /api/announcements/recipients?school_id=&audience=teachers,parents&classes=[{"grade":"6","section":"A"}]
// "This will reach N people" — the composer's live preview. School staff only.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const rawAudience = req.nextUrl.searchParams.get('audience') || 'all'
    if (!rawAudience.split(',').every(p => ['all', 'teachers', 'students', 'parents'].includes(p.trim()))) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }
    let classes: TargetClass[] | null = null
    const rawClasses = req.nextUrl.searchParams.get('classes')
    if (rawClasses) {
      let json: unknown
      try { json = JSON.parse(rawClasses) } catch { return NextResponse.json({ error: 'classes must be JSON' }, { status: 400 }) }
      const parsed = classesParam.safeParse(json)
      if (!parsed.success) return NextResponse.json({ error: 'Invalid classes' }, { status: 400 })
      classes = normaliseClasses(parsed.data)
    }

    const r = await computeRecipients(access.schoolId, normaliseAudience(rawAudience), classes)
    return NextResponse.json({
      teachers: r.teachers.length, students: r.students.length, parents: r.parents.length,
      total: r.teachers.length + r.students.length + r.parents.length,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
