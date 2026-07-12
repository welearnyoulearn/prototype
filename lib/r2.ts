import { S3Client } from '@aws-sdk/client-s3'

// Cloudflare R2 is S3-compatible. One shared client + bucket for backup/restore.
// Env (set in Vercel project settings):
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// Endpoint: https://<account>.r2.cloudflarestorage.com, region "auto".

export const R2_PREFIX = 'db/'
export const LATEST_KEY = `${R2_PREFIX}latest.json`

// Throws a clear error (surfaced as 503 by callers) if R2 isn't configured,
// rather than failing deep inside the AWS SDK with an opaque message.
export function r2Config(): { client: S3Client; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 not configured — set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY',
    )
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  return { client, bucket }
}
