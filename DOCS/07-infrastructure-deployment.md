# WLYL Platform — Infrastructure & Deployment Guide

> Last updated: 2026-04-16

---

## Architecture Overview

```
                        ┌─────────────────────────────┐
                        │         VERCEL (CDN)         │
                        │   Next.js 16.1.7 App Router  │
                        │   - React pages (SSR/Static) │
                        │   - API Routes (Serverless)  │
                        └────────────┬────────────────┘
                                     │
                        ┌────────────▼────────────────┐
                        │      PostgreSQL Database     │
                        │   (Supabase OR Local)        │
                        │   - pg pool (lib/db.ts)      │
                        │   - 50+ tables               │
                        └────────────┬────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
  ┌─────────▼──────┐      ┌──────────▼──────────┐   ┌────────▼───────┐
  │   Cloudinary   │      │  Nodemailer (SMTP)   │   │  Vercel Blob   │
  │  File uploads  │      │  Zoho / Gmail        │   │  (not used yet)│
  │  (task files)  │      │  Email delivery      │   └────────────────┘
  └────────────────┘      └──────────────────────┘
```

---

## Hosting

| Resource | Provider | Details |
|---|---|---|
| Application | Vercel | Next.js serverless deployment |
| Database (prod) | Supabase | PostgreSQL with SSL |
| Database (local dev) | Local PostgreSQL | No SSL, direct connection |
| File storage | Cloudinary | Student task file uploads |
| Email | Zoho Mail / Gmail | SMTP via Nodemailer |
| Domain | Vercel auto-generated | `prototype-sunny3005s-projects.vercel.app` |

---

## Branch Strategy

```
main          ← stable baseline (do NOT merge admin into main)
admin         ← active development + production deployments
```

**Deployment rule:** Deploy directly from `admin` branch using `npx vercel --prod`. Never merge `admin` into `main` — production runs off `admin`.

---

## Environment Variables

These must be set in Vercel dashboard (Settings → Environment Variables) AND in your local `.env.local` file.

| Variable | Required | Example Value | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ Yes | `postgresql://user:pass@host:5432/db` | PostgreSQL connection string |
| `JWT_SECRET` | ✅ Yes | `your-super-secret-key-min-32-chars` | Sign/verify all JWT tokens |
| `EMAIL_HOST` | ✅ Yes | `smtp.zoho.in` or `smtp.gmail.com` | SMTP server |
| `EMAIL_PORT` | Optional | `465` (Zoho) or `587` (Gmail) | SMTP port |
| `EMAIL_USER` | ✅ Yes | `noreply@welearnyoulearn.com` | SMTP username |
| `EMAIL_PASS` | ✅ Yes | (app password) | SMTP password |
| `EMAIL_FROM` | ✅ Yes | `"WLYL Team <noreply@wlyl.com>"` | From address in emails |
| `CLOUDINARY_CLOUD_NAME` | ✅ Yes | `your-cloud-name` | Cloudinary cloud identifier |
| `CLOUDINARY_API_KEY` | ✅ Yes | `123456789012345` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ Yes | `abc123...` | Cloudinary API secret |

### Local `.env.local` file (never commit this)
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/wlyl
JWT_SECRET=dev-secret-key-change-this-in-production
EMAIL_HOST=smtp.zoho.in
EMAIL_USER=dev@welearnyoulearn.com
EMAIL_PASS=your-email-app-password
EMAIL_FROM="WLYL Dev <dev@welearnyoulearn.com>"
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
```

---

## Database Connection

The database pool is in [lib/db.ts](../lib/db.ts). It auto-detects which environment it's running in:

```typescript
// lib/db.ts — simplified
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }   // Supabase needs SSL
    : false                            // local doesn't need SSL
})
```

### Switching between local and Supabase

Two batch scripts at the project root make this easy:

**`use-local-db.bat`** — switch to local PostgreSQL
```bat
set DATABASE_URL=postgresql://postgres:password@localhost:5432/wlyl
```

**`use-supabase-db.bat`** — switch to Supabase
```bat
set DATABASE_URL=postgresql://postgres.xyz:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Or just edit `.env.local` manually and restart `npm run dev`.

---

## Database Migrations

There is **no separate migration tool** (no Prisma, no Flyway). Migrations are built directly into `lib/db.ts`:

```typescript
export async function initDB() {
  // CREATE TABLE IF NOT EXISTS ...
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
  // Each statement is wrapped in try/catch
  // so partial runs don't break anything
}
```

### When migrations run
`initDB()` is called from `instrumentation.ts` — this runs **once when the Next.js server starts** (both in dev and in Vercel on cold start).

It also runs when `POST /api/init` is called — this is called from the login page as a safety net on first visit.

### Adding a new table or column
1. Open [lib/db.ts](../lib/db.ts)
2. Add your `CREATE TABLE` or `ALTER TABLE` statement inside `initDB()`
3. Wrap in try/catch like all the others
4. Deploy → it runs automatically on next cold start

```typescript
// Example: adding a new column
try {
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(100)`)
} catch (e) {
  // already exists or failed — safe to ignore in dev
}
```

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally
- npm

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/welearnyoulearn/prototype.git
cd prototype
git checkout admin

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local
# Edit .env.local with your local DB credentials and other vars

# 4. Create the local database
psql -U postgres -c "CREATE DATABASE wlyl;"

# 5. Start dev server
npm run dev
# → Opens at http://localhost:3000

# 6. Initialize database (first run only)
# Visit http://localhost:3000 — it calls /api/init automatically
# OR manually: curl -X POST http://localhost:3000/api/init

# 7. Create first platform admin
curl -X POST http://localhost:3000/api/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wlyl.com","password":"admin123"}'

# 8. Log in at http://localhost:3000/login
```

### Important: dev uses webpack, not Turbopack
```bash
# package.json scripts:
"dev": "next dev --webpack"    # webpack (avoids Turbopack quirks in dev)
"build": "next build"           # Turbopack (used in Vercel builds)
```

This matters because Turbopack has stricter rules (e.g. `next/dynamic` options must be inline object literals). Issues that show up in Vercel builds may not show in local dev.

---

## Production Deployment

### Deploy to Vercel (from admin branch)

```bash
# Make sure you're on the admin branch
git checkout admin

# Stage and commit all changes
git add <files>
git commit -m "your message"
git push origin admin

# Deploy to production
npx vercel --prod
```

**Do NOT run:**
```bash
git checkout main && git merge admin   # ← NEVER do this
git push --force                        # ← NEVER unless you know exactly why
```

### What happens during a Vercel build

```
npx vercel --prod
    │
    ▼
Vercel uploads changed files
    │
    ▼
Runs "npm run build" (Next.js Turbopack)
    │
    ├── Compiles all TypeScript → checks for errors
    ├── Generates static pages (97 routes)
    ├── Bundles all API routes as serverless functions
    └── Splits components with next/dynamic into separate chunks
    │
    ▼
Build output stored in Vercel CDN
    │
    ▼
Production URL updated:
  https://prototype-sunny3005s-projects.vercel.app
    │
    ▼
On first request (cold start):
  instrumentation.ts runs → initDB() → creates/migrates all tables
```

### Build time: ~38 seconds (with cache)

---

## Service Worker (Offline Attendance)

The file [public/sw-attendance.js](../public/sw-attendance.js) is a service worker for offline attendance marking.

**How it works:**
1. Teacher marks attendance with no network
2. Service worker intercepts `POST /api/attendance`
3. Stores the request in IndexedDB
4. Shows "Saved offline" message
5. When network restores, auto-replays queued requests

**Registration:** The `useOfflineAttendance` hook in [app/school-admin/hooks/useOfflineAttendance.ts](../app/school-admin/hooks/useOfflineAttendance.ts) handles registration.

---

## In-Memory Cache

[lib/responseCache.ts](../lib/responseCache.ts) provides a simple TTL cache:

```typescript
// 60 second cache for teacher lists
const cached = getCache(`teachers:${school_id}`)
if (cached) return cached

const data = await pool.query(...)
setCache(`teachers:${school_id}`, data, 60_000)
```

**Important:** This cache lives in the Node.js process memory. On Vercel:
- Each serverless function invocation may or may not reuse a warm instance
- Cache survives between requests on a warm instance
- Cache is empty on cold starts
- Do NOT use this for security-sensitive data

---

## Email Setup

### Zoho Mail (production)
```env
EMAIL_HOST=smtp.zoho.in
EMAIL_PORT=465
EMAIL_USER=noreply@welearnyoulearn.com
EMAIL_PASS=<zoho-app-password>
EMAIL_FROM="WLYL Team <noreply@welearnyoulearn.com>"
```

### Gmail (fallback / testing)
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your.gmail@gmail.com
EMAIL_PASS=<gmail-app-password>   # NOT your Google account password
                                  # Use: Google Account → Security → App passwords
EMAIL_FROM="WLYL Team <your.gmail@gmail.com>"
```

### Emails sent by the platform
| Trigger | Template | Recipient |
|---|---|---|
| New school created | Onboarding (school_code + temp_password) | School contact email |
| Subscription activated | Plan activation (tier, dates, amount) | School contact email |
| Forgot password | Reset link (1 hour expiry) | User's email |
| Platform admin resets school password | New temp_password | School contact email |

---

## Cloudinary Setup (File Uploads)

Used for student task file submissions.

**Flow:**
1. Student clicks "Upload File" in task submission
2. Frontend calls `POST /api/upload/sign` → gets signed upload URL
3. Frontend uploads directly to Cloudinary (bypasses server)
4. Cloudinary returns file URL
5. URL saved in `task_submissions.file_url`

**Setup:**
1. Create free Cloudinary account at cloudinary.com
2. Go to Settings → API Keys → copy Cloud Name, API Key, API Secret
3. Add to `.env.local` and Vercel environment variables

**Upload folder structure:** `submissions/task_{task_id}_student_{student_id}`

---

## File Structure for Config Files

```
d:\wlyl\prototype\
├── .env.local              ← local env vars (never commit)
├── .gitignore              ← includes .env.local
├── next.config.ts          ← Next.js config (minimal, no overrides)
├── tsconfig.json           ← TypeScript strict mode
├── postcss.config.mjs      ← Tailwind CSS 4
├── eslint.config.mjs       ← Next.js ESLint rules
├── instrumentation.ts      ← Runs initDB() on server start
├── use-local-db.bat        ← Switch to local DB (Windows)
└── use-supabase-db.bat     ← Switch to Supabase (Windows)
```

---

## Monitoring & Debugging

### Check if deployment succeeded
```bash
npx vercel inspect <deployment-url>
# or
npx vercel ls   # list recent deployments
```

### View Vercel build logs
Go to: `https://vercel.com/sunny3005s-projects/prototype` → click latest deployment → View Build Logs

### Check function logs (API errors in production)
Go to: Vercel Dashboard → project → Functions tab → click an API route → view logs

### Common build errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `next/dynamic options must be an object literal` | Turbopack restriction — options passed as variable | Inline the options object directly in each `dynamic()` call |
| `Type error: X is not assignable to Y` | TypeScript strict mode | Fix the type mismatch — never use `// @ts-ignore` |
| `Module not found` | Import path wrong | Check exact path and filename casing (Linux is case-sensitive) |
| `Cannot read properties of null` | DB query returned null, code assumed non-null | Add null check before accessing |

### Local DB health check
```bash
psql -U postgres -d wlyl -c "\dt"   # list all tables
psql -U postgres -d wlyl -c "SELECT COUNT(*) FROM schools;"
```

---

## Security Notes

1. **JWT_SECRET** — must be at least 32 random characters in production. Never use the default `wlyl-super-secret-key-change-in-production`.

2. **Cookies** — all auth cookies are `httpOnly: true, sameSite: 'lax'`. Cannot be read by JavaScript.

3. **School isolation** — every API query filters by `school_id`. Always verify `school_id` comes from the authenticated session, not just the request body.

4. **API routes have no tier enforcement** — the subscription tier gates only control which UI items appear. The API itself does not check tier. If a feature is security-sensitive, add a tier check in the API route.

5. **Cloudinary uploads** — uses signed uploads (server generates signature). The API secret never leaves the server.

6. **Passwords** — all passwords hashed with bcryptjs (10 rounds). Temp passwords are 10 chars from a charset that excludes confusing letters (0, O, l, 1).

7. **Password reset tokens** — 48-char random string, 1 hour expiry, single-use (`used = true` after first redemption).
