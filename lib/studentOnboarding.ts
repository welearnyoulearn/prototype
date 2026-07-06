import { PoolClient } from 'pg'

export type ParentInfo = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

// Looks up an existing parent by email then phone (within school_id), or creates one.
// Pass createIfMissing=false to only link to an existing parent and never insert a new
// row — used when the parent-portal feature is disabled for the school but the parent
// already has an account from an earlier sibling onboarded while it was enabled.
//
// batchCache collapses repeated lookups/creates for the same parent within one request
// (e.g. two siblings in the same upload) so they resolve to a single parent_id instead
// of racing to insert duplicate rows. Pass the same Map across all calls in one request.
export type ParentMatchResult = { parentId: number; wasCreated: boolean } | null

export async function findOrCreateParent(
  client: PoolClient,
  schoolId: number,
  parent: ParentInfo,
  parentHash: string | null,
  batchCache: Map<string, number>,
  createIfMissing: boolean
): Promise<ParentMatchResult> {
  const pe = parent.email?.trim() || null
  const pp = parent.phone?.trim() || null
  const pn = parent.name?.trim() || null
  if (!pe && !pp) return null

  const batchKey = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
  if (batchCache.has(batchKey)) return { parentId: batchCache.get(batchKey)!, wasCreated: false }

  const existingRes = await client.query(
    `SELECT id FROM parents WHERE school_id = $1 AND (
       ($2::text IS NOT NULL AND LOWER(email) = LOWER($2)) OR
       ($3::text IS NOT NULL AND phone = $3)
     ) LIMIT 1`,
    [schoolId, pe, pp]
  )
  if (existingRes.rows.length > 0) {
    const parentId = existingRes.rows[0].id as number
    batchCache.set(batchKey, parentId)
    return { parentId, wasCreated: false }
  }

  if (!createIfMissing || !parentHash) return null

  const insertRes = await client.query(
    `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed)
     VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,
    [schoolId, pn, pe, pp, parentHash]
  )
  const parentId = insertRes.rows[0].id as number
  batchCache.set(batchKey, parentId)
  return { parentId, wasCreated: true }
}

export async function linkStudentParent(client: PoolClient, studentId: number, parentId: number): Promise<void> {
  await client.query(
    `INSERT INTO student_parents (student_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [studentId, parentId]
  )
}
