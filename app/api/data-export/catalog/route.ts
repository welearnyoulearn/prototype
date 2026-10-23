import { NextRequest, NextResponse } from 'next/server'
import { requireFeeAccess } from '@/lib/auth'
import { buildCatalog } from '@/lib/dataExport/service'

// GET /api/data-export/catalog?school_id=
// Everything this school can download (only the modules its plan includes), grouped, with the filter
// definitions and the option lists (classes, exams, academic years, expense categories) the screen needs.
export async function GET(req: NextRequest) {
  try {
    const access = await requireFeeAccess(req.nextUrl.searchParams.get('school_id'))
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(await buildCatalog(access.schoolId))
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
