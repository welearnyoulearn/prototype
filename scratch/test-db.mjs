import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:Kowsik123@localhost:5432/wlyl_db' });

async function queryAll() {
  try {
    const schools = await pool.query('SELECT * FROM schools');
    console.log('--- SCHOOLS ---');
    console.log(schools.rows);

    const classes = await pool.query('SELECT * FROM classes');
    console.log('--- CLASSES ---');
    console.log(classes.rows);

    const students = await pool.query('SELECT * FROM students');
    console.log('--- STUDENTS ---');
    console.log(students.rows);
  } catch (error) {
    console.error('Error querying:', error);
  } finally {
    await pool.end();
  }
}

queryAll();
