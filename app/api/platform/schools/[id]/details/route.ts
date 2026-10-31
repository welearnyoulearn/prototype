import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { loadSchoolDetails, saveSchoolDetails } from '@/lib/schoolProfile'
import { schoolDetailsSchema } from '@/lib/schoolDetails'
import { setupChecklist } from '@/lib/setupChecklist'

// GET/PUT /api/platform/schools/<id>/details — what WLYL keeps about a school (DOCS/SCHOOL-ONBOARDING.md §1)
// and its setup checklist progress. Platform Admin only. Bills already made keep their own "bill to".
async function guard(params: Promise<{ id: string }>) {
  const session = await requirePlatformAdmin()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id } = await params
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'Invalid school id' }, { status: 400 }) }
  return { session, schoolId: Number(id) }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error
  try {
    const [details, checklist] = await Promise.all([loadSchoolDetails(g.schoolId), setupChecklist(g.schoolId)])
    return NextResponse.json({ details, checklist })
  } catch (err) {
    console.error('[platform/school details GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params)
  if ('error' in g) return g.error
  const parsed = schoolDetailsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, { status: 400 })
  try {
    await saveSchoolDetails(g.schoolId, parsed.data)
    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_school_details', 'school', $2, (SELECT name FROM schools WHERE id = $2), $3)`,
      [g.session.userId, g.schoolId, JSON.stringify(parsed.data)]).catch(err => console.error('[audit/school details]', err))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[platform/school details PUT]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
