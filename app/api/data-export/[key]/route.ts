import { NextRequest, NextResponse } from 'next/server'
import { requireFeeAccess } from '@/lib/auth'
import { staffDisplayName } from '@/lib/announcementAudit'
import { buildExport, logExport } from '@/lib/dataExport/service'
import { ExportError, type ExportFormat, type Params } from '@/lib/dataExport/types'

// GET /api/data-export/{key}?school_id=&format=csv|xlsx&<filters…>
// Downloads one export from the catalog (see GET /api/data-export/catalog for keys and filters).
// School admin / principal / vice principal of THAT school (or a platform admin). Each download is logged.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const q = req.nextUrl.searchParams
    const access = await requireFeeAccess(q.get('school_id'))
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const format = (q.get('format') || 'csv') as ExportFormat
    if (format !== 'csv' && format !== 'xlsx') return NextResponse.json({ error: 'format must be csv or xlsx' }, { status: 400 })

    const filters: Params = {}
    for (const [k, v] of q.entries()) {
      if (k === 'school_id' || k === 'format') continue
      if (v.length > 100) return NextResponse.json({ error: `${k} is too long` }, { status: 400 })
      if (v !== '') filters[k] = v
    }

    const built = await buildExport(access.schoolId, key, filters, format)
    const by = await staffDisplayName(access.userId, access.actor)
    await logExport(access.schoolId, key, format, filters, built.rows, access.userId, by).catch(e => console.error('[data-export log]', e))

    return new NextResponse(typeof built.body === 'string' ? built.body : new Uint8Array(built.body), {
      status: 200,
      headers: {
        'Content-Type': built.contentType,
        'Content-Disposition': `attachment; filename="${built.filename}"`,
        'Cache-Control': 'no-store',
        'X-Export-Rows': String(built.rows),
      },
    })
  } catch (err: unknown) {
    if (err instanceof ExportError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
