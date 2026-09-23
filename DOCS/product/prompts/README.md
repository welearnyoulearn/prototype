# How to use these prompts

Claude cannot take many files at once, so each job has **one ready-made file** in `docs/product/bundles/` — the prompt is at the top and all source material follows.

| Job | Attach this ONE file | Size |
|---|---|---|
| Investor / summit pitch deck | `docs/product/bundles/INVESTOR-DECK.md` | ~115 KB |
| School (client) demo deck | `docs/product/bundles/SCHOOL-DECK.md` | ~170 KB |
| Full product documentation (Word) | `docs/product/bundles/DOCUMENTATION.md` | ~185 KB |

1. New chat in claude.ai → attach the one file → type: **"Follow the PROMPT in this file."**
2. Answer the founder questions with real facts only (or say "skip").
3. Never let a deck claim live WhatsApp, a payment gateway, AI features or "every endpoint is authenticated".

If a chat still rejects the file, paste PART 1 (the prompt) as your message and attach only the dossiers it names.

**Refreshing after code changes:** `node scripts/product-docs.mjs` (factbook), then `node scripts/build-doc-bundles.mjs` (bundles).

Individual prompts (`1-documentation.md`, `2-investor-summit-deck.md`, `3-school-demo-deck.md`, `0-update-mode.md`) are the sources the bundles are built from.
