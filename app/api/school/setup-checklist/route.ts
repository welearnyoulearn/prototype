import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { setupChecklist } from '@/lib/setupChecklist'

// GET /api/school/setup-checklist — the signed-in school's first-login setup checklist (DOCS/SCHOOL-ONBOARDING.md
// §5). Each item is done when its data exists. School admin / principal only; the school comes from the session.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['school_admin', 'principal'].includes(session.role) || !session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await setupChecklist(Number(session.schoolId)))
  } catch (err) {
    console.error('[school/setup-checklist]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
