import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBills } from '@/lib/bills'

// GET /api/billing/invoices — every bill of the signed-in school admin / principal's own school.
// Bill carries no provider cost, so nothing needs stripping.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['school_admin', 'principal'].includes(session.role) || !session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    return NextResponse.json(await getBills({ schoolId: session.schoolId })) // school from the session only
  } catch (err) {
    console.error('[billing/invoices GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
