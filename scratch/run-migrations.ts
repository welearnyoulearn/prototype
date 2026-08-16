import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const { initDB } = await import('../lib/db')
  console.log('Starting DB migrations...')
  try {
    await initDB()
    console.log('✅ DB Migrations completed successfully!')
  } catch (err) {
    console.error('❌ Error running migrations:', err)
  }
}

main().then(() => process.exit(0))
