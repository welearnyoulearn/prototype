---
name: update-product-docs
description: Keep the product docs in step with dev — feature docs, feature map, catalog and factbook. Use when a feature ships, changes or is removed, or when asked to refresh the factbook or decks.
---

1. Feature added/changed/removed in `lib/features.ts` or its screens: edit `wiki/features/<doc>.md` prose (status, what works, limits) and `wiki/features/feature-map.json` (key → doc + screen files).
2. Run `node scripts/product-docs.mjs` — regenerates `wiki/features/CATALOG.md`, the `AUTO:evidence` block in each feature doc, and the `AUTO:catalog|plans|stats` blocks in `docs/product/PRODUCT-FACTBOOK.md`. It fails if a screen calls an API route that does not exist.
3. Edit the non-AUTO factbook text only if the honest-limits (section 7), removed list or roadmap changed.
4. Run `node scripts/product-docs.mjs --check` (also enforced by `e2e/docs-coverage.spec.ts`).
5. Decks/documents: follow `docs/product/prompts/README.md`; use `0-update-mode.md` to refresh an existing one.
Never edit AUTO blocks by hand. Never describe a removed/planned feature as live.
