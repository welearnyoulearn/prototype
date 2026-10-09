import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/plans/public — no login: the plans shown on the website. Public fields only.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT tier, display_name AS name, COALESCE(description, '') AS description,
              monthly_price::float8 AS monthly, yearly_price::float8 AS yearly, staff_limit AS "staffLimit"
       FROM plan_pricing
       WHERE is_public AND is_active AND tier IN ('basic', 'standard', 'premium')
       ORDER BY sort_order, tier`,
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[plans/public GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
