import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/announcements?school_id=&audience=teachers|students|parents|all
// Returns active announcements filtered by audience.
// audience param: if provided, returns announcements targeted to 'all' OR that specific audience.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const audience  = req.nextUrl.searchParams.get('audience') // 'teachers' | 'students' | 'parents' | 'all' | null

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  // Build audience filter:
  // - No audience param → return everything (admin view)
  // - audience=X → return rows where target_audience='all' OR contains X in comma-separated list
  let audienceFilter = ''
  const params: (string | number)[] = [school_id, today]

  if (audience && audience !== 'all') {
    audienceFilter = `AND (
      target_audience = 'all'
      OR target_audience = $3
      OR target_audience LIKE $3 || ',%'
      OR target_audience LIKE '%,' || $3
      OR target_audience LIKE '%,' || $3 || ',%'
    )`
    params.push(audience)
  }

  const { rows } = await pool.query(`
    SELECT id, title, content, announcement_type, target_audience, priority,
           created_by_name, expires_at::text, created_at
    FROM announcements
    WHERE school_id = $1
      AND (expires_at IS NULL OR expires_at >= $2)
      ${audienceFilter}
    ORDER BY
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      created_at DESC
  `, params)

  return NextResponse.json(rows)
}

// POST /api/announcements
// Body: { school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at }
// target_audience: 'all' | comma-separated e.g. 'teachers,students' | 'teachers' | 'students' | 'parents'
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    school_id, title, content,
    announcement_type = 'general',
    target_audience = 'all',
    priority = 'normal',
    created_by_name = 'Admin',
    expires_at,
  } = body

  if (!school_id || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'school_id, title, content required' }, { status: 400 })
  }
  if (!['general', 'circular', 'event', 'alert'].includes(announcement_type)) {
    return NextResponse.json({ error: 'Invalid announcement_type' }, { status: 400 })
  }
  if (!['normal', 'high', 'urgent'].includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }

  // Validate target_audience — allow 'all' or any comma-separated subset of valid values
  const VALID_AUDIENCES = ['all', 'teachers', 'students', 'parents']
  const audienceParts = String(target_audience).split(',').map(s => s.trim())
  const isValidAudience = audienceParts.every(p => VALID_AUDIENCES.includes(p))
  if (!isValidAudience) {
    return NextResponse.json({ error: 'Invalid target_audience' }, { status: 400 })
  }
  // Normalise: if all 3 individual audiences are selected, store as 'all'
  const normalised =
    audienceParts.length === 3 &&
    ['teachers', 'students', 'parents'].every(a => audienceParts.includes(a))
      ? 'all'
      : audienceParts.join(',')

  const { rows: [row] } = await pool.query(`
    INSERT INTO announcements
      (school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [school_id, title.trim(), content.trim(), announcement_type, normalised, priority, created_by_name, expires_at || null])

  return NextResponse.json(row, { status: 201 })
}
