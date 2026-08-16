import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// GET /api/platform/subjects/[id]/materials
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { rows } = await pool.query(
      'SELECT * FROM master_subject_materials WHERE subject_id = $1 ORDER BY material_type, created_at',
      [id]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('Platform subject materials GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
  }
}

// POST /api/platform/subjects/[id]/materials
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: subjectId } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { material_type, title, file_url } = await req.json()
    if (material_type !== 'textbook' && material_type !== 'handbook') {
      return NextResponse.json({ error: 'material_type must be "textbook" or "handbook"' }, { status: 400 })
    }
    if (!title?.trim() || !file_url?.trim()) {
      return NextResponse.json({ error: 'title and file_url are required' }, { status: 400 })
    }

    const { rows } = await pool.query(
      `INSERT INTO master_subject_materials (subject_id, material_type, title, file_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [subjectId, material_type, title.trim(), file_url.trim()]
    )
    return NextResponse.json({ material: rows[0] })
  } catch (err) {
    console.error('Platform subject materials POST error:', err)
    return NextResponse.json({ error: 'Failed to save material' }, { status: 500 })
  }
}
