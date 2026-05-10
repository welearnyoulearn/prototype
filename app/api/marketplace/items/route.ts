import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ensureDB } from '@/lib/db'

// GET /api/marketplace/items
// Returns all active marketplace items
export async function GET() {
  await ensureDB()
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, emoji, cost_points FROM marketplace_items WHERE active = TRUE ORDER BY cost_points ASC`
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('marketplace/items error:', err)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }
}
