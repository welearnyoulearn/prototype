import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession, getPlatformSession } from '@/lib/auth'

// Same tenant guard as /api/school/enabled-features: any authenticated
// school-scoped session may read its OWN school's tier (the student AI Hub
// sidebar needs this); platform_admin may read any school's.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const schoolId = Number(id)

    const platformSession = await getPlatformSession()
    if (platformSession?.role !== 'platform_admin') {
      const session = await getAnySession()
      if (!session || Number(session.schoolId) !== schoolId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const result = await pool.query(`SELECT * FROM school_ai_access WHERE school_id = $1`, [id])
    if (result.rows.length === 0) {
      return NextResponse.json({ school_id: parseInt(id), tier: 'none' })
    }
    return NextResponse.json(result.rows[0])
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Failed to fetch AI access' }, { status: 500 })
  }
}

// Assignment is a platform-admin-only action — same as school_subscriptions tier.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const platformSession = await getPlatformSession()
    if (platformSession?.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { tier } = await req.json()
    if (!['none', 'ai_basic', 'ai_pro'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const result = await pool.query(
      `INSERT INTO school_ai_access (school_id, tier, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (school_id) DO UPDATE SET tier = $2, updated_at = NOW()
       RETURNING *`,
      [id, tier]
    )

    return NextResponse.json(result.rows[0])
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Failed to update AI access' }, { status: 500 })
  }
}
