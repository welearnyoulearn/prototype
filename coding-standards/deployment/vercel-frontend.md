# Vercel Deployment (Next.js)

## Setup: Connect GitHub repo → Vercel auto-detects Next.js

## Environment Variables (set in Vercel dashboard)

```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
NEXTAUTH_URL, NEXTAUTH_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME, SMTP_FROM_EMAIL
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
NEXT_PUBLIC_APP_URL
```

## Flow

```
Push to main → auto-deploy production
Push to branch → preview deployment
```

## Custom Domain: Settings > Domains > Add → CNAME to cname.vercel-dns.com → SSL auto

## Build Settings: Framework=Next.js, Build=`pnpm build`, Install=`pnpm install`, Node=20.x
