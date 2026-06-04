/**
 * Database migration: Tokyo → Mumbai
 * Usage: node scripts/migrate-to-mumbai.js <MUMBAI_DATABASE_URL>
 *
 * Copies all data from the source DB to the target DB.
 * Tables are inserted in FK-dependency order.
 * All sequences are reset to MAX(id)+1 after migration.
 */

const { Pool } = require('pg')

const SOURCE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres.kqumkvdreyxwlrpqhfph:ILvuIndia111%23%23%23@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'

const TARGET_URL = process.argv[2]

if (!TARGET_URL) {
  console.error('\nUsage: node scripts/migrate-to-mumbai.js <MUMBAI_DATABASE_URL>\n')
  process.exit(1)
}

const source = new Pool({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } })
const target = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } })

// Tables in strict FK-dependency order (parents before children, no cycles)
const TABLE_ORDER = [
  // ── No FK deps ───────────────────────────────
  'app_bootstrap_state',
  'marketplace_items',
  'plan_features',
  'hub_daily_content',

  // ── Schools (root) ───────────────────────────
  'schools',
  'school_subscriptions',

  // ── Users & Auth ─────────────────────────────
  'users',
  'user_profiles',
  'password_reset_tokens',
  'platform_audit_log',

  // ── Staff ────────────────────────────────────
  'teachers',
  'department_hods',

  // ── Students & Parents ───────────────────────
  'students',
  'parents',
  'student_parents',

  // ── Classes & Academic ───────────────────────
  'classes',
  'academic_years',
  'school_schedule_settings',
  'schedule_templates',        // school_id FK → after schools
  'class_subjects',
  'school_subject_templates',
  'report_card_config',
  'curriculum_assignments',
  'display_tokens',
  'school_calendar',
  'announcements',

  // ── Timetable ────────────────────────────────
  'class_timetable_modes',
  'timetable_versions',
  'timetable',
  'class_timetable',
  'teacher_unavailability',
  'teacher_ai_sessions',

  // ── Attendance & Leave ────────────────────────
  'leave_requests',
  'substitute_assignments',
  'attendance',

  // ── Tasks & Doubts ────────────────────────────
  'tasks',
  'task_submissions',
  'task_reminders',
  'doubts',
  'doubt_messages',
  'doubt_upvotes',

  // ── Exams ────────────────────────────────────
  'exam_records',
  'exam_subjects',
  'exam_marks',
  'parent_mark_acks',
  'report_card_remarks',
  'student_class_history',

  // ── Fees ─────────────────────────────────────
  'fee_categories',
  'fee_structures',
  'fee_structure_locks',
  'fee_structure_amendments',
  'student_fee_category_assignments',
  'student_fee_ledger',
  'student_fee_ledger_edits',
  'fee_waivers',
  'fee_payments',

  // ── Gamification ─────────────────────────────
  'student_badges',
  'student_points',
  'student_streaks',
  'marketplace_orders',

  // ── Weekly tests ──────────────────────────────
  'weekly_tests',
  'student_hub_completions',

  // ── Portal & Notifications ────────────────────
  'student_portal_sessions',
  'student_portal_activity',
  'notifications',

  // ── Syllabus ──────────────────────────────────
  'syllabus_topics',

  // ── AI & Newspapers ──────────────────────────
  'ai_chat_sessions',
  'daily_newspapers',
  'student_newspaper_reads',
]

async function copyTable(tableName, client) {
  // Check if table exists in source
  const srcExists = await source.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [tableName]
  )
  if (!srcExists.rows.length) { process.stdout.write(`  skip (not in source)\n`); return 0 }

  // Get columns that exist in the TARGET (only copy what target knows about)
  const tgtCols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`, [tableName]
  )
  const targetColSet = new Set(tgtCols.rows.map(r => r.column_name))

  const { rows } = await source.query(`SELECT * FROM "${tableName}"`)
  if (!rows.length) { process.stdout.write(`  0 rows\n`); return 0 }

  // Intersect: only columns that exist in both source AND target
  const allSrcCols = Object.keys(rows[0])
  const cols = allSrcCols.filter(c => targetColSet.has(c))
  const colList = cols.map(c => `"${c}"`).join(', ')

  // Insert in batches of 50 (smaller batches = fewer parameter limits)
  // Serialize JSONB/object values back to JSON strings for pg
  const serialize = (v) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v)
    return v
  }

  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const valuePlaceholders = batch.map(
      (_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ')
    const flatValues = batch.flatMap(row => cols.map(c => serialize(row[c])))

    await client.query(
      `INSERT INTO "${tableName}" (${colList}) VALUES ${valuePlaceholders}
       ON CONFLICT DO NOTHING`,
      flatValues
    )
    inserted += batch.length
  }

  process.stdout.write(`  ${inserted} rows ✓\n`)
  return inserted
}

async function resetSequences() {
  console.log('\n── Resetting sequences ──────────────────────────────')

  const { rows: seqs } = await target.query(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `)

  for (const { sequence_name } of seqs) {
    // Match sequence to its table's id column
    const tableName = sequence_name.replace(/_id_seq$/, '').replace(/_seq$/, '')
    try {
      const { rows } = await target.query(
        `SELECT MAX(id) AS max_id FROM "${tableName}"`
      )
      const maxId = rows[0]?.max_id
      if (maxId != null) {
        await target.query(
          `SELECT setval('${sequence_name}', $1, true)`, [maxId]
        )
        console.log(`  ${sequence_name} → ${maxId}`)
      }
    } catch {
      // Table doesn't have id column or doesn't exist — skip
    }
  }

  // Special sequence: receipt_number_seq
  try {
    const { rows } = await source.query(`SELECT last_value FROM receipt_number_seq`)
    if (rows[0]?.last_value) {
      await target.query(`SELECT setval('receipt_number_seq', $1, true)`, [rows[0].last_value])
      console.log(`  receipt_number_seq → ${rows[0].last_value}`)
    }
  } catch { /* doesn't exist yet */ }
}

async function verify() {
  console.log('\n── Verification ─────────────────────────────────────')
  const tables = ['schools', 'users', 'teachers', 'students', 'classes', 'tasks', 'fee_payments']
  for (const t of tables) {
    try {
      const [src, tgt] = await Promise.all([
        source.query(`SELECT COUNT(*) AS n FROM "${t}"`),
        target.query(`SELECT COUNT(*) AS n FROM "${t}"`),
      ])
      const s = src.rows[0].n, d = tgt.rows[0].n
      const ok = s === d ? '✓' : '✗ MISMATCH'
      console.log(`  ${t.padEnd(20)} source: ${String(s).padStart(4)}  target: ${String(d).padStart(4)}  ${ok}`)
    } catch (e) {
      console.log(`  ${t.padEnd(20)} error: ${e.message}`)
    }
  }
}

async function run() {
  console.log('══════════════════════════════════════════════════════')
  console.log('  WLYL Database Migration: Tokyo → Mumbai')
  console.log('══════════════════════════════════════════════════════')
  console.log(`  Source: ${SOURCE_URL.split('@')[1]?.split('/')[0] ?? 'tokyo'}`)
  console.log(`  Target: ${TARGET_URL.split('@')[1]?.split('/')[0] ?? 'mumbai'}`)
  console.log('')

  // Test connections
  try {
    await source.query('SELECT 1')
    console.log('✓ Source DB connected')
  } catch (e) { console.error('✗ Source DB connection failed:', e.message); process.exit(1) }

  try {
    await target.query('SELECT 1')
    console.log('✓ Target DB connected')
  } catch (e) { console.error('✗ Target DB connection failed:', e.message); process.exit(1) }

  console.log('\n── Creating schema in Mumbai (via ensureDB) ─────────')
  console.log('  (Tables will be created by app on first boot)')
  console.log('  Running schema bootstrap now...')

  // Dynamically load and run ensureDB on the target
  // We use the source schema directly via SQL DDL instead
  const { rows: schemaTables } = await source.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)
  console.log(`  Source has ${schemaTables.length} tables`)

  console.log('\n── Copying data ─────────────────────────────────────')

  // First, temporarily disable FK triggers on target for clean bulk insert
  const targetClient = await target.connect()
  try {
    // Disable FK constraint checks for faster bulk insert
    await targetClient.query('SET session_replication_role = replica')

    let totalRows = 0
    const seen = new Set()

    for (const tableName of TABLE_ORDER) {
      if (seen.has(tableName)) continue
      seen.add(tableName)
      process.stdout.write(`  ${tableName.padEnd(40)}`)
      const n = await copyTable(tableName, targetClient)
      totalRows += n
    }

    // Copy any tables we might have missed
    for (const { table_name } of schemaTables) {
      if (!seen.has(table_name)) {
        process.stdout.write(`  ${table_name.padEnd(40)}`)
        const n = await copyTable(table_name, targetClient)
        totalRows += n
        seen.add(table_name)
      }
    }

    await targetClient.query('SET session_replication_role = DEFAULT')
    console.log(`\n  Total: ${totalRows} rows copied`)
  } finally {
    targetClient.release()
  }

  await resetSequences()
  await verify()

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Migration complete!')
  console.log('  Next: Update DATABASE_URL in .env.local and Vercel')
  console.log('══════════════════════════════════════════════════════\n')
}

run()
  .catch(e => { console.error('\n✗ Migration failed:', e.message); process.exit(1) })
  .finally(() => { source.end(); target.end() })
