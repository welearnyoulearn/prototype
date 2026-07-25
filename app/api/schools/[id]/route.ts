import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const result = await pool.query(`
        SELECT
          s.*,
          sub.tier,
          (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'active') AS teacher_count,
          (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS student_count,
          u.id AS admin_user_id,
          u.email AS admin_email,
          u.first_login AS admin_first_login,
          u.created_at AS admin_created_at
        FROM schools s
        LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
        LEFT JOIN users u ON u.school_id = s.id AND u.role = 'school_admin'
        WHERE s.id = $1
      `, [id])
      if (result.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch school' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const body = await req.json()
      const { name, type, city, country, status, phone, email, address, logo_url, logo_align, grading_scheme, board, upi_id, restore, receipt_header_blocks } = body

      // Restore a soft-deleted school
      if (restore) {
        const r = await pool.query(
          `UPDATE schools SET deleted_at = NULL, status = 'active' WHERE id = $1 RETURNING *`, [id]
        )
        return NextResponse.json(r.rows[0])
      }

      const VALID_SIZES = new Set(['sm', 'md', 'lg', 'xl'])
      const VALID_ALIGNS = new Set(['left', 'center', 'right'])
      if (logo_align !== undefined && logo_align !== null && !VALID_ALIGNS.has(logo_align)) {
        return NextResponse.json({ error: 'Invalid logo_align' }, { status: 400 })
      }
      if (receipt_header_blocks !== undefined) {
        if (!Array.isArray(receipt_header_blocks) || receipt_header_blocks.length > 6) {
          return NextResponse.json({ error: 'receipt_header_blocks must be an array of at most 6 items' }, { status: 400 })
        }
        for (const b of receipt_header_blocks) {
          if (typeof b?.text !== 'string' || b.text.length > 200
            || !VALID_SIZES.has(b.size) || !VALID_ALIGNS.has(b.align)
            || typeof b.bold !== 'boolean' || typeof b.italic !== 'boolean') {
            return NextResponse.json({ error: 'Invalid receipt header block' }, { status: 400 })
          }
        }
      }

      const result = await pool.query(
        `UPDATE schools SET
          name                  = COALESCE($1,  name),
          type                  = COALESCE($2,  type),
          city                  = COALESCE($3,  city),
          country               = COALESCE($4,  country),
          status                = COALESCE($5,  status),
          phone                 = COALESCE($6,  phone),
          email                 = COALESCE($7,  email),
          address               = COALESCE($8,  address),
          logo_url              = COALESCE($9,  logo_url),
          grading_scheme        = COALESCE($10, grading_scheme),
          board                 = COALESCE($11, board),
          upi_id                = COALESCE($13, upi_id),
          receipt_header_blocks = COALESCE($14, receipt_header_blocks),
          logo_align             = COALESCE($15, logo_align)
         WHERE id = $12 RETURNING *`,
        [name, type, city, country, status, phone, email, address,
         logo_url,
         grading_scheme !== undefined ? JSON.stringify(grading_scheme) : null,
         board ?? null,
         id,
         upi_id ?? null,
         receipt_header_blocks !== undefined ? JSON.stringify(receipt_header_blocks) : null,
         logo_align ?? null]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update school' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Soft delete — preserves all data, sets deleted_at timestamp
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const result = await pool.query(
        `UPDATE schools SET deleted_at = NOW(), status = 'deleted' WHERE id = $1 RETURNING id, name`,
        [id]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })

      // Log to audit trail
      await pool.query(
        `INSERT INTO platform_audit_log (action, entity_type, entity_id, entity_name, details)
         VALUES ('delete_school', 'school', $1, $2, '{}')`,
        [id, result.rows[0].name]
      ).catch(() => {})

      return NextResponse.json({ message: 'School deleted', school: result.rows[0] })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to delete school' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
