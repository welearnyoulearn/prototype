/**
 * Explicit cross-account leakage test for GET /api/parent/doubt-digest.
 * Confirms parent A cannot fetch parent B's child's digest, using two real,
 * distinct parent/student pairs from the dev DB. Requires `npm run dev`
 * running locally.
 *
 * Usage: npx tsx scripts/ai-hub/test-doubt-digest-isolation.ts
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

async function main() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const { default: pool } = await import('../../lib/db')
  const { signParentToken } = await import('../../lib/auth')

  const { rows } = await pool.query(`
    SELECT p.id AS parent_id, p.name AS parent_name, p.school_id, p.email,
           sp.student_id, s.name AS student_name
    FROM parents p
    JOIN student_parents sp ON sp.parent_id = p.id
    JOIN students s ON s.id = sp.student_id
    WHERE s.school_id = 22
    ORDER BY p.id
    LIMIT 2
  `)
  if (rows.length < 2) {
    console.error('Need at least 2 distinct parent/student pairs in school 22 to test isolation.')
    process.exit(1)
  }
  const [a, b] = rows
  console.log(`Parent A: ${a.parent_name} (id ${a.parent_id}) -> child ${a.student_name} (id ${a.student_id})`)
  console.log(`Parent B: ${b.parent_name} (id ${b.parent_id}) -> child ${b.student_name} (id ${b.student_id})`)

  function tokenFor(row: typeof a) {
    return signParentToken({
      parentId: row.parent_id, schoolId: row.school_id, role: 'parent',
      passwordChanged: true, name: row.parent_name, email: row.email || 'test@example.com',
    })
  }

  async function fetchDigest(token: string, studentId: number) {
    const res = await fetch(`${appUrl}/api/parent/doubt-digest?student_id=${studentId}`, {
      headers: { Cookie: `wlyl-parent=${token}` },
    })
    return { status: res.status, body: await res.json() }
  }

  console.log('\n--- Test 1: Parent A fetches their OWN child (should succeed) ---')
  const own = await fetchDigest(tokenFor(a), a.student_id)
  console.log('Status:', own.status, '| student in response:', own.body?.student?.name)
  const ownOk = own.status === 200 && own.body?.student?.id === a.student_id

  console.log('\n--- Test 2: Parent B tries to fetch Parent A\'s child (should be BLOCKED) ---')
  const leak = await fetchDigest(tokenFor(b), a.student_id)
  console.log('Status:', leak.status, '| body:', JSON.stringify(leak.body))
  const leakBlocked = leak.status === 403 && !leak.body?.student

  console.log('\n--- Test 3: No auth cookie at all (should be 401) ---')
  const noAuth = await fetch(`${appUrl}/api/parent/doubt-digest?student_id=${a.student_id}`)
  console.log('Status:', noAuth.status)
  const noAuthOk = noAuth.status === 401

  console.log('\n========== RESULTS ==========')
  console.log('Own child accessible:      ', ownOk ? 'PASS' : 'FAIL')
  console.log('Cross-account access blocked:', leakBlocked ? 'PASS' : 'FAIL')
  console.log('Unauthenticated blocked:    ', noAuthOk ? 'PASS' : 'FAIL')

  await pool.end()
  if (!ownOk || !leakBlocked || !noAuthOk) process.exit(1)
}

main().catch(err => { console.error('CRASHED', err); process.exit(1) })
