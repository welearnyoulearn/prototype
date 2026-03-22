import pg from 'pg'
const { Pool } = pg

const pool = new Pool({ connectionString: 'postgresql://postgres:Kowsik123@localhost:5432/wlyl_db' })

async function check() {
  try {
    // Check tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users','user_profiles','password_reset_tokens','schools')
      ORDER BY table_name
    `)
    console.log('\n✅ Tables found:', tables.rows.map(r => r.table_name).join(', '))

    // Check users
    const users = await pool.query(`SELECT id, email, school_code, role, first_login, profile_completed FROM users ORDER BY id`)
    console.log(`\n👤 Users in DB (${users.rowCount}):`)
    users.rows.forEach(u => console.log(`  [${u.role}] ${u.email || u.school_code} | first_login=${u.first_login} | profile_completed=${u.profile_completed}`))

    // Check schools with school_code
    const schools = await pool.query(`SELECT id, name, school_code, email FROM schools ORDER BY id`)
    console.log(`\n🏫 Schools (${schools.rowCount}):`)
    schools.rows.forEach(s => console.log(`  #${s.id} ${s.name} | code=${s.school_code} | email=${s.email}`))

    // Check user_profiles
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' ORDER BY ordinal_position
    `)
    console.log('\n📋 users columns:', cols.rows.map(r => r.column_name).join(', '))

  } catch (e) {
    console.error('❌ DB Error:', e.message)
  } finally {
    await pool.end()
  }
}

check()
