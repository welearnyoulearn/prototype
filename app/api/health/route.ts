import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    pghost: process.env.PGHOST ? 'set' : 'missing',
    jwt: process.env.JWT_SECRET ? 'set' : 'missing',
    setup: process.env.SETUP_SECRET ? 'set' : 'missing',
    node_env: process.env.NODE_ENV,
  })
}
