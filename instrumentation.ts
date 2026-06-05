export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { ensureDB } = await import('./lib/db')
      await ensureDB()
    } catch (err) {
      // DB unreachable at cold start — routes will retry ensureDB() on first request
      console.error('[startup] DB init failed — will retry on first request:', err)
    }
  }
}
