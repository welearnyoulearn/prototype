# Coding Standards & Project Accelerator

> **How to use:** Point Claude to this folder when starting any new project.
> Example: "Refer to `/Users/vamsikrishnavh/Documents/Codex/coding Standeds/` for all standards and conventions."

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| **Frontend** | Next.js (SEO/full-stack) OR React + Vite (dashboards/internal tools) |
| **Frontend Hosting** | Vercel |
| **Backend** | Node.js (default) / Python (FastAPI) / Golang (Gin) |
| **Backend Hosting** | AWS EC2 / Azure VM / GCP Compute Engine (low cost VMs) |
| **Database** | Supabase (DB only, no auth) / PostgreSQL direct |
| **Auth** | NextAuth (Auth.js) for Next.js / Custom JWT for Python & Go |
| **Email/SMTP** | Zoho SMTP |
| **Storage** | Cloudflare R2 |
| **E2E Testing** | Playwright |
| **Unit Testing** | Vitest |
| **Styling** | Tailwind CSS + shadcn/ui |
| **State Management** | Zustand |
| **Package Manager** | pnpm |
| **Language** | TypeScript (strict mode) |

---

## When to Pick Next.js vs React (Vite)

| Project Type | Pick | Why |
|---|---|---|
| SaaS / Product | Next.js | SEO, API routes, SSR |
| Admin dashboard | React (Vite) | No SEO, pure client-side |
| Landing page + app | Next.js | SEO for public pages |
| Internal tool | React (Vite) | Simple, no SEO |
| E-commerce | Next.js | SEO critical |
| Separate Python/Go backend | React (Vite) | Frontend only |

## When to Pick Which Backend

| Backend | When |
|---------|------|
| Node.js / Next.js API routes | Default full-stack JS, Vercel-native |
| Python (FastAPI) | Data-heavy, ML/AI, automation |
| Golang (Gin) | High-performance APIs, concurrency, microservices |

---

## Non-Negotiable Rules

1. **Every interactive UI element MUST have `data-testid`** - for Playwright
2. **TypeScript strict mode** - no `any` type allowed
3. **Supabase = database only** - never use Supabase Auth
4. **pnpm** for all JS/TS projects
5. **Tailwind + shadcn/ui** for all frontends
6. **Zustand** for client state management

---

## Folder Index

| Folder | Contents |
|--------|----------|
| [conventions/](conventions/) | Coding rules for TypeScript, React, APIs, Python, Go, issue workflow |
| [blueprints/auth/](blueprints/auth/) | Login, signup, JWT, NextAuth patterns |
| [blueprints/email/](blueprints/email/) | Zoho SMTP setup and email templates |
| [blueprints/storage/](blueprints/storage/) | Cloudflare R2 file upload patterns |
| [blueprints/database/](blueprints/database/) | Supabase DB-only setup, schema patterns |
| [testing/](testing/) | Playwright E2E + Vitest unit testing |
| [deployment/](deployment/) | Vercel, VM setup, CI/CD |
| [checklists/](checklists/) | Project kickoff, pre-launch, security, code review, bug fix, feature dev |
| [credentials/](credentials/) | .env templates with all service configs |
| [templates/](templates/) | Project folder structures, Docker, GitHub Actions |

---

## Issue & Feature Workflow

All bugs and features follow a defined lifecycle. See [conventions/issue-workflow.md](conventions/issue-workflow.md) for the full process.

| Situation | What to Do |
|-----------|-----------|
| Found a bug | Log it in GitHub Issues → follow `checklists/bug-fix.md` |
| Building a feature | Log it in GitHub Issues → follow `checklists/feature-development.md` |
| Critical production bug | Log it → hotfix branch → fast-track review → deploy immediately |
| Need to track decisions | Add to `docs/DECISIONS.md` in the project repo |
| Need to track known issues | Add to `docs/KNOWN_ISSUES.md` in the project repo |

### Project Repo Tracking Files

Every project keeps these files in `docs/`:

```
docs/CHANGELOG.md       — what shipped per release
docs/KNOWN_ISSUES.md    — current bugs + workarounds
docs/DECISIONS.md       — architecture decision records
docs/post-mortems/      — post-mortems for critical bugs
```

---

## Quick Start for New Project

1. Read this file for tech stack decisions
2. Pick frontend: Next.js or React (Vite) based on project type
3. Pick backend: Node.js / Python / Go based on requirements
4. Copy `.env.template` from `credentials/` folder
5. Follow `checklists/new-project-kickoff.md` step by step
6. Use blueprints for auth, email, storage, database setup
7. Follow conventions for all code
8. Set up Playwright tests from day one
9. Create `docs/` folder with `CHANGELOG.md`, `KNOWN_ISSUES.md`, `DECISIONS.md`
10. Use `checklists/code-review.md` for every PR before merge
11. Use `checklists/bug-fix.md` and `checklists/feature-development.md` for all work
