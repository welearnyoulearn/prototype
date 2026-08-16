import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
console.log('DATABASE_URL is:', process.env.DATABASE_URL)
console.time('ensureDB')
const { ensureDB } = await import('../lib/db')
await ensureDB()
console.timeEnd('ensureDB')
process.exit(0)
