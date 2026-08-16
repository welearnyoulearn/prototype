// One-off script: configures CORS on the R2 bucket so the browser can PUT
// files directly to presigned upload URLs (subject-materials uploads).
// The bucket was previously only ever written to server-side (DB backups),
// which needs no CORS policy — direct browser uploads do.
//
// Run: node scripts/setup-r2-cors.mjs
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'
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
if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2 env vars')
  process.exit(1)
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

await client.send(new PutBucketCorsCommand({
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
}))

const current = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
console.log('CORS applied:', JSON.stringify(current.CORSRules, null, 2))
