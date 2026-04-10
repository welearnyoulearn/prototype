import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'

// Teacher self-service password change
// POST /api/teachers/[id]/change-password { current_password, new_password, school_id }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const body = await req.json()
  const { current_password, new_password, school_id } = body

  if (!current_password || !new_password || !school_id) {
    return NextResponse.json({ error: 'current_password, new_password and school_id required' }, { status: 400 })
  }
  if (new_password.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const { rows: [teacher] } = await pool.query(
    'SELECT id, school_id, password_hash FROM teachers WHERE id = $1 AND school_id = $2',
    [id, school_id]
  )
  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  if (!teacher.password_hash) {
    return NextResponse.json({ error: 'No password set — contact admin' }, { status: 400 })
  }

  const valid = await verifyPassword(current_password, teacher.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  const newHash = await hashPassword(new_password)
  await pool.query(
    'UPDATE teachers SET password_hash = $1, password_changed = TRUE WHERE id = $2',
    [newHash, id]
  )

  return NextResponse.json({ success: true, message: 'Password changed successfully' })
}
