import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { verifyPassword, setParentAuthCookie, ParentJWTPayload, schoolHasFeature } from '@/lib/auth'
import { recordSessionStart } from '@/lib/usageTracking'

// Login accepts either the parent's email or phone in one field. Matching by
// phone is only safe because parents now carries a per-school unique index
// on phone (idx_parents_school_phone_unique, lib/db.ts) — a given school can
// never have two live parent rows sharing a phone going forward.
//
// It's still possible for the SAME real parent to end up as two separate
// rows within one school — e.g. one child onboarded with only email, a
// sibling onboarded with only phone, before either field existed on both
// rows, or a rare race between two concurrent onboarding requests. If the
// identifier matches more than one row in the same school, that's exactly
// the "these are actually the same parent" case: merge them into one row
// (keep the older id, move every student_parents link and any non-null
// email/phone/name onto it, drop the duplicate) rather than silently
// picking one and hiding the other child.
async function mergeDuplicateParents(schoolId: number, parentIds: number[]): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const survivorId = Math.min(...parentIds)
    const others = parentIds.filter(id => id !== survivorId)

    const rows = (await client.query(
      `SELECT id, name, email, phone FROM parents WHERE id = ANY($1)`,
      [parentIds]
    )).rows as { id: number; name: string | null; email: string | null; phone: string | null }[]

    const survivor = rows.find(r => r.id === survivorId)!
    const mergedName = survivor.name || rows.find(r => r.name)?.name || null
    const mergedEmail = survivor.email || rows.find(r => r.email)?.email || null
    const mergedPhone = survivor.phone || rows.find(r => r.phone)?.phone || null

    await client.query(
      `UPDATE parents SET name = $1, email = $2, phone = $3 WHERE id = $4`,
      [mergedName, mergedEmail, mergedPhone, survivorId]
    )

    // Repoint every child link onto the survivor. ON CONFLICT DO NOTHING
    // covers the case where the same student was (incorrectly) linked to
    // both duplicate rows already.
    await client.query(
      `INSERT INTO student_parents (student_id, parent_id)
       SELECT student_id, $1 FROM student_parents WHERE parent_id = ANY($2)
       ON CONFLICT DO NOTHING`,
      [survivorId, others]
    )
    await client.query(`DELETE FROM student_parents WHERE parent_id = ANY($1)`, [others])
    await client.query(`DELETE FROM parents WHERE id = ANY($1)`, [others])

    await client.query('COMMIT')
    console.warn(`[parent/auth/login] Merged duplicate parent rows ${JSON.stringify(others)} into ${survivorId} for school ${schoolId}`)
    return survivorId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { identifier, password } = await req.json()
    const trimmed = typeof identifier === 'string' ? identifier.trim() : ''
    if (!trimmed || !password) {
      return NextResponse.json({ error: 'Email or phone, and password, are required' }, { status: 400 })
    }

    const matches = await pool.query(
      `SELECT p.id, p.name, p.email, p.school_id, p.password_hash, p.password_changed
       FROM parents p
       WHERE p.password_hash IS NOT NULL
         AND (LOWER(p.email) = LOWER($1) OR p.phone = $1)`,
      [trimmed]
    )

    if (matches.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email/phone or password' }, { status: 401 })
    }

    // Try each candidate's password — normally there's exactly one match.
    // Multiple rows only happens for the duplicate-parent edge case above,
    // and even then only rows in the same school could plausibly be the
    // same person (different schools sharing a phone is coincidence/test
    // data, never a merge candidate — see lib/db.ts migration comment).
    let parent: typeof matches.rows[number] | null = null
    for (const candidate of matches.rows) {
      if (await verifyPassword(password, candidate.password_hash)) { parent = candidate; break }
    }
    if (!parent) {
      return NextResponse.json({ error: 'Invalid email/phone or password' }, { status: 401 })
    }

    const sameSchoolDuplicates = matches.rows.filter(r => r.school_id === parent!.school_id)
    if (sameSchoolDuplicates.length > 1) {
      const survivorId = await mergeDuplicateParents(parent.school_id, sameSchoolDuplicates.map(r => r.id))
      if (survivorId !== parent.id) {
        const refreshed = await pool.query(
          `SELECT id, name, email, school_id, password_hash, password_changed FROM parents WHERE id = $1`,
          [survivorId]
        )
        parent = refreshed.rows[0]
      }
    }

    if (!parent.school_id || !(await schoolHasFeature(parent.school_id, 'parent-portal'))) {
      return NextResponse.json({ error: 'Invalid email/phone or password' }, { status: 401 })
    }

    const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [parent.school_id])
    const schoolName = schoolResult.rows[0]?.name || null

    const payload: ParentJWTPayload = {
      parentId: parent.id,
      schoolId: parent.school_id,
      role: 'parent',
      passwordChanged: parent.password_changed,
      name: parent.name || trimmed,
      email: parent.email,
    }

    await setParentAuthCookie(payload)

    const usageSessionId = await recordSessionStart({
      schoolId: parent.school_id,
      actorId: parent.id,
      actorRole: 'parent',
      actorName: parent.name || parent.email || trimmed,
    })

    return NextResponse.json({
      success: true,
      passwordChanged: parent.password_changed,
      name: parent.name,
      schoolName,
      usageSessionId,
    })
  } catch (error) {
    console.error('[parent/auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
