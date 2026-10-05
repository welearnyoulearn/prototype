import { PoolClient } from 'pg'
import { randomInt } from 'crypto'
import pool from './db'
import { hashPortalPassword, generateTempPassword } from './auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail, sendChildCredentialsToParentEmail } from './email'
import { sendWhatsappMessage } from './whatsapp'

// System ID = students.roll_number, the student's permanent id and login. Short enough to type
// and to fit in a layout: "WLYL-" + 8 characters from an alphabet without look-alikes
// (no I, L, O, 0, 1) = 31^8 (~8.5e11) values. Old IDs (wlyl-stu-<school>-<hex>) stay valid —
// they are logins / printed credentials — and the two formats coexist. Uniqueness is NOT left
// to chance: generateUniqueStudentIds checks the database first, and the
// enforce_unique_student_login_id trigger (lib/db.ts) rejects any duplicate that slips through.
const SYSTEM_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const SYSTEM_ID_LENGTH = 8

export function generateStudentId(): string {
  let out = 'WLYL-'
  for (let i = 0; i < SYSTEM_ID_LENGTH; i++) out += SYSTEM_ID_ALPHABET[randomInt(SYSTEM_ID_ALPHABET.length)]
  return out
}

// Returns `count` new system IDs, distinct from each other and from every student id already
// stored (compared case-insensitively, as the login does). Collisions are regenerated.
export async function generateUniqueStudentIds(
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: { id: string }[] }> },
  count: number
): Promise<string[]> {
  const ids = new Set<string>()
  for (let attempt = 0; attempt < 8; attempt++) {
    while (ids.size < count) ids.add(generateStudentId())
    const { rows } = await db.query(
      'SELECT LOWER(roll_number) AS id FROM students WHERE LOWER(roll_number) = ANY($1::text[])',
      [[...ids].map(i => i.toLowerCase())]
    )
    if (rows.length === 0) return [...ids]
    const taken = new Set(rows.map(r => r.id))
    for (const id of [...ids]) if (taken.has(id.toLowerCase())) ids.delete(id)
  }
  throw new Error('Could not allocate unique student ids')
}

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

export type BackfillResult = {
  backfilled: number
  studentCredentials: { student_id: number; name: string; grade: string; section: string; school_roll_number: number | null; login: string; temp_password: string }[]
  parentCredentials: { name: string; phone: string; login: string; temp_password: string; is_new: boolean }[]
}

// Generates + delivers portal credentials for every active student at this
// school still missing one (password_hash IS NULL), for whichever of
// student/parent is requested. Shared by:
//   - the manual "Activate Portal Access" button (POST /api/school-admin/students/backfill-portal)
//   - the automatic catch-up that fires when a platform admin turns
//     student-portal/parent-portal ON for a school (via the feature-overrides
//     route) — same logic, same delivery, just triggered differently.
// Never touches rows that already have a credential — safe to call repeatedly,
// and safe to call from both trigger points without double-crediting anyone.
export async function backfillPortalCredentials({
  schoolId, wantStudent, wantParent,
}: {
  schoolId: number; wantStudent: boolean; wantParent: boolean
}): Promise<BackfillResult> {
  const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [schoolId])
  const schoolName = schoolRes.rows[0]?.name || 'Your School'
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const targetRes = await pool.query(
    `SELECT * FROM students WHERE school_id = $1 AND status = 'active' AND password_hash IS NULL`,
    [schoolId]
  )
  const targets = targetRes.rows

  const studentCredentials: BackfillResult['studentCredentials'] = []
  const parentCredentials: BackfillResult['parentCredentials'] = []

  if (targets.length === 0) return { backfilled: 0, studentCredentials, parentCredentials }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const processedParentIds = new Map<string, number>()
    const credParentsSeen = new Set<string>()
    const sendsToFire: (() => void)[] = []

    for (const student of targets) {
      let studentTempPassword: string | null = null

      if (wantStudent) {
        studentTempPassword = generateTempPassword(8)
        const passwordHash = await hashPortalPassword(studentTempPassword)
        await client.query(`UPDATE students SET password_hash = $1 WHERE id = $2`, [passwordHash, student.id])

        studentCredentials.push({
          student_id: student.id,
          name: student.name,
          grade: student.grade || '',
          section: student.section || '',
          school_roll_number: student.school_roll_number,
          login: student.email || '(no email — share manually)',
          temp_password: studentTempPassword,
        })

        if (student.email) {
          sendsToFire.push(() => {
            sendStudentWelcomeEmail({
              to: student.email, name: student.name, schoolName,
              rollNumber: student.roll_number, tempPassword: studentTempPassword!,
              loginUrl: `${appUrl}/student/login`,
            }).catch(console.error)
          })
        }
        if (student.phone) {
          sendsToFire.push(() => {
            sendWhatsappMessage({
              schoolId, to: student.phone, templateName: 'student_credentials', recipientName: student.name,
              templateParams: {
                student_name: student.name, school_name: schoolName, login: student.roll_number,
                temp_password: studentTempPassword!, login_url: `${appUrl}/student/login`,
              },
            }).catch(console.error)
          })
        }
      }

      // Resolved parent contact for this student — looked up (never created)
      // even when this run doesn't target parents, so a student whose parent
      // already has an account still gets their credentials copied to that
      // parent. createIfMissing stays tied to wantParent — this never
      // provisions a new parent row on a student-only run.
      let resolvedParentContact: { email: string | null; phone: string | null; name: string | null } | null = null

      if (student.parent_email || student.parent_phone) {
        const pe = student.parent_email?.trim() || null
        const pp = student.parent_phone?.trim() || null
        const pn = student.parent_name?.trim() || null
        const batchKey = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
        const isNewLookup = !processedParentIds.has(batchKey)

        let parentTempPassword: string | null = null
        let parentHash: string | null = null
        if (wantParent && isNewLookup) {
          parentTempPassword = generateTempPassword(10)
          parentHash = await hashPortalPassword(parentTempPassword)
        }

        const match = await findOrCreateParent(
          client, schoolId, { name: pn, email: pe, phone: pp },
          parentHash, processedParentIds, wantParent
        )
        if (match) {
          await linkStudentParent(client, student.id, match.parentId)
          const parentRow = await client.query('SELECT email, phone, name FROM parents WHERE id = $1', [match.parentId])
          resolvedParentContact = {
            email: parentRow.rows[0]?.email || null,
            phone: parentRow.rows[0]?.phone || null,
            name: parentRow.rows[0]?.name || null,
          }

          if (wantParent && match.wasCreated && !credParentsSeen.has(batchKey) && parentTempPassword) {
            credParentsSeen.add(batchKey)
            parentCredentials.push({
              name: pn || pe || pp || '',
              phone: pp || '',
              login: pe || pp || '(no contact)',
              temp_password: parentTempPassword,
              is_new: true,
            })
            const parentDisplayName = pn || pe || pp || 'there'
            if (pe) {
              const studentName = student.name
              sendsToFire.push(() => {
                sendParentWelcomeEmail({
                  to: pe, parentName: parentDisplayName, studentName, schoolName,
                  tempPassword: parentTempPassword!, loginUrl: `${appUrl}/parent/login`,
                }).catch(console.error)
              })
            }
            if (pp) {
              const studentName = student.name
              sendsToFire.push(() => {
                sendWhatsappMessage({
                  schoolId, to: pp, templateName: 'parent_credentials', recipientName: parentDisplayName,
                  templateParams: {
                    parent_name: parentDisplayName, student_name: studentName, school_name: schoolName,
                    login: pe || pp, temp_password: parentTempPassword!, login_url: `${appUrl}/parent/login`,
                  },
                }).catch(console.error)
              })
            }
          }
        }
      }

      // Parent always gets a copy of the child's own student-portal
      // credentials too, whenever this run actually generated a fresh
      // student password and a parent contact is resolvable.
      if (studentTempPassword && resolvedParentContact) {
        const contact = resolvedParentContact
        const studentName = student.name
        const rollNumber = student.roll_number
        const tempPassword = studentTempPassword
        const parentDisplayName = contact.name || contact.email || contact.phone || 'there'
        if (contact.email) {
          sendsToFire.push(() => {
            sendChildCredentialsToParentEmail({
              to: contact.email!,
              parentName: parentDisplayName,
              studentName, schoolName, rollNumber, tempPassword,
              loginUrl: `${appUrl}/student/login`,
            }).catch(console.error)
          })
        }
        if (contact.phone) {
          sendsToFire.push(() => {
            sendWhatsappMessage({
              schoolId, to: contact.phone!, templateName: 'student_credentials', recipientName: parentDisplayName,
              templateParams: {
                student_name: studentName, school_name: schoolName, login: rollNumber,
                temp_password: tempPassword, login_url: `${appUrl}/student/login`,
              },
            }).catch(console.error)
          })
        }
      }
    }

    await client.query('COMMIT')
    sendsToFire.forEach(send => send())

    return { backfilled: targets.length, studentCredentials, parentCredentials }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export type ParentLinkRow = {
  studentId: number
  parent: ParentInfo
  hash: string | null          // password hash, only used when this row creates the parent
  createIfMissing: boolean
}
export type ResolvedParentContact = { email: string | null; phone: string | null; name: string | null } | null

// Set-based equivalent of calling findOrCreateParent + linkStudentParent + a contact
// SELECT for every student: one lookup, one bulk INSERT of new parents, one bulk INSERT
// of links and one contact SELECT — a handful of statements instead of ~4 per student.
// Matching rules are unchanged: a row's key is its email (case-insensitive) when it has
// one, else its phone; an existing parent is matched by email OR phone; rows sharing a
// key within the batch share one parent. Returns the resolved contact per input row.
export async function linkParentsBulk(
  client: PoolClient, schoolId: number, rows: ParentLinkRow[]
): Promise<ResolvedParentContact[]> {
  type Ref = { id: number } | { createIdx: number }
  const trimmed = rows.map(r => ({
    pe: r.parent.email?.trim() || null, pp: r.parent.phone?.trim() || null, pn: r.parent.name?.trim() || null,
  }))
  const emails = [...new Set(trimmed.map(t => t.pe?.toLowerCase()).filter((e): e is string => !!e))]
  const phones = [...new Set(trimmed.map(t => t.pp).filter((p): p is string => !!p))]
  const existing = emails.length || phones.length
    ? (await client.query<{ id: number; email_l: string | null; phone: string | null }>(
        `SELECT id, LOWER(email) AS email_l, phone FROM parents
         WHERE school_id = $1 AND (LOWER(email) = ANY($2::text[]) OR phone = ANY($3::text[]))
         ORDER BY id`,
        [schoolId, emails, phones]
      )).rows
    : []

  const cache = new Map<string, Ref>()
  const toCreate: { name: string | null; email: string | null; phone: string | null; hash: string }[] = []
  const refs: (Ref | null)[] = rows.map((r, i) => {
    const { pe, pp, pn } = trimmed[i]
    if (!pe && !pp) return null
    const key = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
    const cached = cache.get(key)
    if (cached) return cached
    const match = existing.find(e => (pe && e.email_l === pe.toLowerCase()) || (pp && e.phone === pp))
    let ref: Ref | null = null
    if (match) ref = { id: match.id }
    else if (r.createIfMissing && r.hash) {
      ref = { createIdx: toCreate.length }
      toCreate.push({ name: pn, email: pe, phone: pp, hash: r.hash })
    }
    if (ref) cache.set(key, ref)
    return ref
  })

  let createdIds: number[] = []
  if (toCreate.length > 0) {
    const ins = await client.query<{ id: number }>(
      `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed)
       SELECT $1, t.name, t.email, t.phone, t.hash, FALSE
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) WITH ORDINALITY AS t(name, email, phone, hash, n)
       ORDER BY t.n
       RETURNING id`,
      [schoolId, toCreate.map(c => c.name), toCreate.map(c => c.email), toCreate.map(c => c.phone), toCreate.map(c => c.hash)]
    )
    createdIds = ins.rows.map(r => r.id)
  }
  const parentIdOf = (ref: Ref | null): number | null =>
    !ref ? null : 'id' in ref ? ref.id : createdIds[ref.createIdx]

  const links = rows.map((r, i) => ({ studentId: r.studentId, parentId: parentIdOf(refs[i]) })).filter(l => l.parentId !== null)
  if (links.length > 0) {
    await client.query(
      `INSERT INTO student_parents (student_id, parent_id)
       SELECT * FROM unnest($1::int[], $2::int[]) ON CONFLICT DO NOTHING`,
      [links.map(l => l.studentId), links.map(l => l.parentId)]
    )
  }
  const ids = [...new Set(links.map(l => l.parentId as number))]
  const contacts = new Map<number, { email: string | null; phone: string | null; name: string | null }>()
  if (ids.length > 0) {
    const { rows: cr } = await client.query<{ id: number; email: string | null; phone: string | null; name: string | null }>(
      `SELECT id, email, phone, name FROM parents WHERE id = ANY($1::int[])`, [ids]
    )
    for (const c of cr) contacts.set(c.id, { email: c.email || null, phone: c.phone || null, name: c.name || null })
  }
  return refs.map(ref => {
    const pid = parentIdOf(ref)
    return pid === null ? null : (contacts.get(pid) ?? { email: null, phone: null, name: null })
  })
}
