import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { AnnouncementCreateSchema, normaliseAudience, normaliseClasses, type TargetClass } from '@/lib/announcements'
import { getViewer, readerCanSee } from '@/lib/announcementAudience'
import { recordAudit, staffDisplayName } from '@/lib/announcementAudit'
import { todayIST } from '@/lib/istDate'

// Hard ceiling on rows per request so a noticeboard can never come back unbounded.
const MAX_LIMIT = 500

function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

const COLUMNS = `a.id, a.school_id, a.title, a.content, a.announcement_type, a.target_audience, a.priority,
  a.created_by_name, a.expires_at::text AS expires_at, a.created_at, a.updated_at, a.status, a.publish_at,
  COALESCE(a.publish_at, a.created_at) AS published_at, a.pinned, a.requires_ack, a.template_key,
  a.card_data, a.target_classes, a.translations`

// Staff board tabs. Readers always get "live" (or "past" for their archive).
const STAFF_SCOPES: Record<string, string> = {
  live: `a.status = 'published' AND a.deleted_at IS NULL AND (a.publish_at IS NULL OR a.publish_at <= NOW()) AND (a.expires_at IS NULL OR a.expires_at >= $2::date)`,
  drafts: `a.status = 'draft' AND a.deleted_at IS NULL`,
  scheduled: `a.status = 'published' AND a.deleted_at IS NULL AND a.publish_at > NOW()`,
  archive: `a.status = 'published' AND a.deleted_at IS NULL AND (a.publish_at IS NULL OR a.publish_at <= NOW()) AND a.expires_at < $2::date`,
  deleted: `a.deleted_at IS NOT NULL`,
  all: `a.deleted_at IS NULL`,
}
const READER_SCOPES: Record<string, string> = {
  live: STAFF_SCOPES.live,
  past: `a.status = 'published' AND a.deleted_at IS NULL AND (a.publish_at IS NULL OR a.publish_at <= NOW()) AND a.expires_at < $2::date`,
}

// GET /api/announcements?school_id=&scope=&audience=&limit=&offset=
// • Teacher / student / parent: the notices addressed to THEM (their role, and their class(es) when a
//   notice targets classes), with seen / acknowledged flags. scope=past lists expired ones.
// • School staff: scope live (default) | drafts | scheduled | archive | deleted | all, with seen counts.
//   audience=teachers|students|parents filters by audience (staff only).
export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewer()
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // Scope comes from the session; the param is only allowed to agree with it.
    const schoolId = viewer.kind === 'staff' ? viewer.schoolId : viewer.reader.schoolId
    if (Number(school_id) !== Number(schoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const scopeName = req.nextUrl.searchParams.get('scope') ?? 'live'
    const scopes = viewer.kind === 'staff' ? STAFF_SCOPES : READER_SCOPES
    if (!scopes[scopeName]) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })

    // India date: a notice that expires "today" stays up until midnight IST, not 05:30 the next morning
    const params: (string | number)[] = [schoolId, todayIST()]
    let extraSelect = ''
    let join = ''
    let audienceFilter = ''

    if (viewer.kind === 'staff') {
      extraSelect = `, (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id) AS seen_count,
                       (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id AND r.acked_at IS NOT NULL) AS ack_count`
      const audience = req.nextUrl.searchParams.get('audience')
      if (audience && audience !== 'all') {
        params.push(audience)
        audienceFilter = `AND (a.target_audience = 'all' OR a.target_audience = $${params.length}
          OR a.target_audience LIKE $${params.length} || ',%' OR a.target_audience LIKE '%,' || $${params.length}
          OR a.target_audience LIKE '%,' || $${params.length} || ',%')`
      }
    } else {
      params.push(viewer.reader.role, viewer.reader.id)
      join = `LEFT JOIN announcement_reads rd ON rd.announcement_id = a.id AND rd.reader_type = $3 AND rd.reader_id = $4`
      extraSelect = `, (rd.seen_at IS NOT NULL) AS seen, (rd.acked_at IS NOT NULL) AS acked`
    }

    const { rows } = await pool.query(`
      SELECT ${COLUMNS}${extraSelect}
      FROM announcements a
      ${join}
      WHERE a.school_id = $1 AND $2::date IS NOT NULL AND ${scopes[scopeName]} ${audienceFilter}
      ORDER BY a.pinned DESC,
        CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        COALESCE(a.publish_at, a.created_at) DESC,
        a.id DESC
    `, params)

    // Class targeting is checked here (a JSON list per notice) — a school has at most a few hundred live notices.
    const visible = viewer.kind === 'staff'
      ? rows
      : rows.filter(r => readerCanSee(viewer.reader, { target_audience: r.target_audience, target_classes: r.target_classes as TargetClass[] | null }))

    const paginated = req.nextUrl.searchParams.has('limit') || req.nextUrl.searchParams.has('offset')
    if (!paginated) return NextResponse.json(visible)
    const limit = Math.min(parseCount(req.nextUrl.searchParams.get('limit'), MAX_LIMIT), MAX_LIMIT)
    const offset = parseCount(req.nextUrl.searchParams.get('offset'), 0)
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
      return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
    }
    return NextResponse.json({ data: visible.slice(offset, offset + limit), limit, offset, total: visible.length })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/announcements
// Body: { school_id, title, content, announcement_type, target_audience, priority, expires_at,
//         status: 'published' | 'draft', publish_at (future = scheduled), pinned, requires_ack,
//         template_key + card_data (greeting card), target_classes, translations }
// School admin / principal / vice principal of THAT school (or a platform admin) only.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const access = await requireFeeAccess(body?.school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = AnnouncementCreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    const d = parsed.data
    if (d.card_data && !d.template_key) return NextResponse.json({ error: 'card_data needs a template_key' }, { status: 400 })

    // Author comes from the signed-in user, never from the request
    const createdBy = await staffDisplayName(access.userId, access.actor)

    const publishAt = d.publish_at ? new Date(d.publish_at) : null
    // A schedule in the past just means "now"
    const scheduledFor = publishAt && publishAt.getTime() > Date.now() ? publishAt.toISOString() : null
    const classes = normaliseClasses(d.target_classes as TargetClass[] | null | undefined)

    const { rows: [row] } = await pool.query(`
      INSERT INTO announcements
        (school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at,
         status, publish_at, pinned, requires_ack, template_key, card_data, target_classes, translations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id, school_id, title, content, announcement_type, target_audience, priority, created_by_name,
        expires_at::text AS expires_at, created_at, status, publish_at, pinned, requires_ack, template_key,
        card_data, target_classes, translations
    `, [
      access.schoolId, d.title, d.content, d.announcement_type, normaliseAudience(d.target_audience), d.priority, createdBy, d.expires_at || null,
      d.status, d.status === 'published' ? scheduledFor : null, d.pinned, d.requires_ack, d.template_key ?? null,
      d.card_data ? JSON.stringify(d.card_data) : null, classes ? JSON.stringify(classes) : null, d.translations ? JSON.stringify(d.translations) : null,
    ])

    await recordAudit(row.id, access.schoolId, d.status === 'draft' ? 'drafted' : 'created', createdBy,
      { title: d.title, scheduled_for: d.status === 'published' ? scheduledFor : null, audience: row.target_audience, classes })
    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
