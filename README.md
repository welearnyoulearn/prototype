# WLYL School Platform

A multi-portal, multi-tenant school-management platform for Indian schools (Next.js App Router, TypeScript, PostgreSQL on Supabase used as a database only).

Five portals in one app: **Platform Admin**, **School Admin**, **Teacher**, **Student**, **Parent**. Schools get only the features their plan (and any per-school override) enables.

## Run it

```bash
pnpm install
npm run dev          # dev server (webpack mode)
npm run build        # production build
npm run lint
npm run test:e2e     # Playwright
npm run sync         # returning developer: pull, install, migrate — see docs/LOCAL_SYNC.md
```

Configuration is by environment variables (names in `docs/product/features/00-platform-architecture.md` §11).

## Documentation map

- **Product & feature dossiers:** [`docs/product/features/`](docs/product/features/README.md)
- **Factbook (source of facts for decks):** [`docs/product/PRODUCT-FACTBOOK.md`](docs/product/PRODUCT-FACTBOOK.md)
- **Living wiki and task log:** [`wiki/README.md`](wiki/README.md)
- **API reference:** `/api-docs`
- **Engineering rules:** [`CLAUDE.md`](CLAUDE.md), [`coding-standards/`](coding-standards/STANDARDS.md)
- **Decisions / changelog / known issues:** `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `docs/KNOWN_ISSUES.md`
