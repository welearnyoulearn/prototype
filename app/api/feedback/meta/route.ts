import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { getFieldConfig } from '@/lib/feedbackFieldsServer'

// No auth required — the public feedback form reads this to render its header
// and to know whether the form should even show. Returns a bare 404 for both
// "school doesn't exist" and "feature disabled" so an anonymous caller can't
// distinguish the two.
const MetaQuerySchema = z.object({
  school_id: z.coerce.number().int().positive(),
})

export async function GET(req: NextRequest) {
  const parsed = MetaQuerySchema.safeParse({ school_id: req.nextUrl.searchParams.get('school_id') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  }
  const { school_id } = parsed.data

  try {
    const { rows: [school] } = await pool.query(
      `SELECT id, name, status FROM schools WHERE id = $1`, [school_id]
    )
    if (!school || school.status !== 'active') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const enabled = await schoolHasFeature(school_id, 'school-feedback')
    if (!enabled) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const fields = await getFieldConfig(school_id)
    return NextResponse.json({ id: school.id, name: school.name, fields })
  } catch (err) {
    console.error('GET /api/feedback/meta error:', err)
    return NextResponse.json({ error: 'Failed to load school' }, { status: 500 })
  }
}
