export async function register() {
  // Only run on the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureDB } = await import('./lib/db')
    await ensureDB()
  }
}
