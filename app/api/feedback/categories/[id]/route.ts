import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackCategoryUpdateSchema } from '@/lib/validation/feedback'

// PATCH /api/feedback/categories/[id]
// Body: { label?, icon?, department?, is_active?, sort_order? }
// No DELETE verb by design — deactivate via is_active:false so historical
// feedback_submission_ratings snapshots (category_label/department) stay
// meaningful even after a category is retired.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [category] } = await pool.query(`SELECT school_id FROM feedback_categories WHERE id = $1`, [id])
    if (!category) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(category.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = feedbackCategoryUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { label, icon, department, is_active, sort_order } = parsed.data
    if ([label, icon, department, is_active, sort_order].every(v => v === undefined)) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const sets: string[] = []
    const values: unknown[] = []
    if (label !== undefined)      { values.push(label);      sets.push(`label = $${values.length}`) }
    if (icon !== undefined)       { values.push(icon);       sets.push(`icon = $${values.length}`) }
    if (department !== undefined) { values.push(department); sets.push(`department = $${values.length}`) }
    if (is_active !== undefined)  { values.push(is_active);  sets.push(`is_active = $${values.length}`) }
    if (sort_order !== undefined) { values.push(sort_order); sets.push(`sort_order = $${values.length}`) }
    values.push(id)

    const { rows: [row] } = await pool.query(
      `UPDATE feedback_categories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
