import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/fees/categories?school_id=X
export async function GET(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    try {
      // Self-heal: rename applicability_type → category_type if needed, add if missing
      await pool.query(`
        ALTER TABLE fee_categories
          ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'fixed'
      `)
      const { rows } = await pool.query(
        `SELECT fc.*,
                COUNT(DISTINCT fs.id)  AS structure_count,
                COUNT(DISTINCT sfl.id) AS ledger_count
         FROM fee_categories fc
         LEFT JOIN fee_structures fs      ON fs.fee_category_id  = fc.id
         LEFT JOIN student_fee_ledger sfl ON sfl.fee_category_id = fc.id
         WHERE fc.school_id = $1
         GROUP BY fc.id ORDER BY fc.name`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/fees/categories
export async function POST(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const { school_id, name, description, frequency, category_type } = await req.json()
      if (!school_id || !name) return NextResponse.json({ error: 'school_id and name required' }, { status: 400 })
      const { rows: [row] } = await pool.query(
        `INSERT INTO fee_categories (school_id, name, description, frequency, category_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [school_id, name.trim(), description || null, frequency || 'monthly', category_type || 'fixed']
      )
      return NextResponse.json(row, { status: 201 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('unique')) return NextResponse.json({ error: 'Category name already exists' }, { status: 409 })
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/fees/categories?id=X
export async function PUT(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const client = await pool.connect()
    try {
      const { name, description, frequency, is_active, category_type, changed_by = 'Admin' } = await req.json()

      // Ensure changelog table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS fee_category_changelog (
          id            SERIAL PRIMARY KEY,
          school_id     INTEGER NOT NULL,
          category_id   INTEGER NOT NULL,
          field_changed TEXT    NOT NULL,
          old_value     TEXT,
          new_value     TEXT,
          changed_by    TEXT    NOT NULL DEFAULT 'Admin',
          changed_at    TIMESTAMPTZ DEFAULT NOW()
        )`)

      // Fetch current values before update
      const { rows: [current] } = await client.query(
        `SELECT school_id, name, frequency, is_active, category_type FROM fee_categories WHERE id = $1`, [id]
      )

      const { rows: [row] } = await client.query(
        `UPDATE fee_categories SET
          name          = COALESCE($1, name),
          description   = COALESCE($2, description),
          frequency     = COALESCE($3, frequency),
          is_active     = COALESCE($4, is_active),
          category_type = COALESCE($5, category_type)
         WHERE id = $6 RETURNING *`,
        [name, description, frequency, is_active, category_type, id]
      )

      // Log each field that changed
      if (current) {
        const checks = [
          { field: 'name',          old: current.name,          newVal: name },
          { field: 'frequency',     old: current.frequency,     newVal: frequency },
          { field: 'is_active',     old: String(current.is_active), newVal: is_active != null ? String(is_active) : undefined },
          { field: 'category_type', old: current.category_type, newVal: category_type },
        ]
        for (const c of checks) {
          if (c.newVal !== undefined && c.newVal !== null && String(c.old) !== String(c.newVal)) {
            await client.query(
              `INSERT INTO fee_category_changelog (school_id, category_id, field_changed, old_value, new_value, changed_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [current.school_id, id, c.field, String(c.old), String(c.newVal), changed_by]
            )
          }
        }
      }

      return NextResponse.json(row)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
    finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/fees/categories?id=X
// Only allowed if category has no ledger entries (never collected fees).
// If ledger entries exist, returns 409 — caller should deactivate instead.
export async function DELETE(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [{ cnt }] } = await client.query(
        `SELECT COUNT(*) AS cnt FROM student_fee_ledger WHERE fee_category_id = $1`, [id]
      )
      if (parseInt(cnt) > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'has_ledger_data', message: 'This category has fee records. Deactivate it instead to preserve history.' },
          { status: 409 }
        )
      }
      await client.query(`DELETE FROM student_fee_category_assignments WHERE fee_category_id = $1`, [id])
      await client.query(`DELETE FROM fee_structures WHERE fee_category_id = $1`, [id])
      await client.query(`DELETE FROM fee_categories WHERE id = $1`, [id])
      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
