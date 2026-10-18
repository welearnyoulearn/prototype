import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'

// Expo push tokens for the parent mobile app (#133). Auth is the same httpOnly
// parent cookie every /api/parent/* route uses; school and parent come from the
// session only.
// POST   { token } → remember this phone for the signed-in parent
// DELETE { token } → forget this phone (only if it belongs to the caller)

const TokenBody = z.object({
  token: z.string().max(255).regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/),
})

async function readToken(req: NextRequest): Promise<string | null> {
  const parsed = TokenBody.safeParse(await req.json().catch(() => null))
  return parsed.success ? parsed.data.token : null
}

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    // Upsert on token: a phone that signs in as another parent moves to that parent.
    await pool.query(
      `INSERT INTO expo_push_tokens (school_id, parent_id, token, last_used_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token) DO UPDATE
         SET school_id = EXCLUDED.school_id, parent_id = EXCLUDED.parent_id, last_used_at = NOW()`,
      [parent.schoolId, parent.parentId, token],
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[parent/push/expo POST]', err)
    return NextResponse.json({ error: 'Failed to save push token' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDB()
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = await readToken(req)
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    await pool.query('DELETE FROM expo_push_tokens WHERE token = $1 AND parent_id = $2', [token, parent.parentId])
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[parent/push/expo DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete push token' }, { status: 500 })
  }
}
