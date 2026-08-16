import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readFileSync } from 'node:fs'

function loadEnv() {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const key = `materials/test-${Date.now()}.txt`
const url = await getSignedUrl(
  client,
  new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: 'text/plain' }),
  { expiresIn: 600 },
)
console.log('Presigned URL:', url)

// 1. Server-side PUT (no browser, no CORS involved) — proves the URL/signature/permissions work at all.
const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'hello from test script' })
console.log('Server-side PUT status:', putRes.status, await putRes.text().catch(() => ''))

// 2. Simulate a browser CORS preflight (OPTIONS) against the same URL, with an Origin header,
//    to see exactly what CORS headers R2 sends back.
const preflight = await fetch(url, {
  method: 'OPTIONS',
  headers: {
    Origin: 'http://localhost:3000',
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'content-type',
  },
})
console.log('Preflight status:', preflight.status)
console.log('Preflight CORS headers:', {
  allowOrigin: preflight.headers.get('access-control-allow-origin'),
  allowMethods: preflight.headers.get('access-control-allow-methods'),
  allowHeaders: preflight.headers.get('access-control-allow-headers'),
})
