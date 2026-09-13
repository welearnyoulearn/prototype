// One-off/reusable: activates an AI Hub plan for a school (billing
// foundation only — no real payment integration yet, prototype phase).
// Idempotent — re-running for the same school just updates the existing row.
//
// Usage:
//   npx tsx scripts/ai-hub/seed-pilot-subscription.ts --school_id=22
//   npx tsx scripts/ai-hub/seed-pilot-subscription.ts --school_id=22 --plan="Starter" --students=100
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

function parseArgs() {
  const out: Record<string, string> = {}
  for (const arg of process.argv.slice(2)) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    out[k] = rest.join('=')
  }
  return out
}

async function main() {
  const args = parseArgs()
  const schoolId = Number(args.school_id)
  const planName = args.plan || 'Starter'
  if (!schoolId) {
    console.error('Usage: npx tsx scripts/ai-hub/seed-pilot-subscription.ts --school_id=<id> [--plan="Starter"] [--students=100]')
    process.exit(1)
  }

  const { default: pool, ensureDB } = await import('../../lib/db')
  await ensureDB()

  const school = await pool.query('SELECT id, name, status FROM schools WHERE id = $1', [schoolId])
  if (school.rows.length === 0) {
    console.error(`No school with id ${schoolId}`)
    process.exit(1)
  }
  console.log(`School: ${school.rows[0].name} (status: ${school.rows[0].status})`)

  const plan = await pool.query('SELECT id, students_included FROM ai_plans WHERE name = $1', [planName])
  if (plan.rows.length === 0) {
    console.error(`No ai_plans row named "${planName}" — seed one first (see lib/db.ts runIncrementalMigrations).`)
    process.exit(1)
  }
  const { id: aiPlanId, students_included: defaultStudents } = plan.rows[0]
  const studentsLicensed = args.students ? Number(args.students) : defaultStudents

  const result = await pool.query(
    `INSERT INTO school_ai_subscriptions (school_id, ai_plan_id, active, students_licensed, start_date)
     VALUES ($1, $2, TRUE, $3, CURRENT_DATE)
     ON CONFLICT (school_id) DO UPDATE SET
       ai_plan_id = $2, active = TRUE, students_licensed = $3, updated_at = NOW()
     RETURNING *`,
    [schoolId, aiPlanId, studentsLicensed]
  )
  console.log('school_ai_subscriptions row:', result.rows[0])

  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
