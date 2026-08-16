import pg from 'pg'
const { Pool } = pg

const pool = new Pool({ connectionString: 'postgresql://postgres:Kowsik123@localhost:5432/wlyl_db' })

async function run() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `)
    console.log('Tables in DB:')
    res.rows.forEach(r => console.log(' - ' + r.table_name))
  } catch (err) {
    console.error('Error listing tables:', err)
  } finally {
    await pool.end()
  }
}
run()
