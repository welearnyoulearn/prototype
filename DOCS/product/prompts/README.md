# How to use these prompts

1. Run `node scripts/product-docs.mjs` (or ask Claude Code to "update the product docs") so the factbook is current.
2. New chat in claude.ai → attach `docs/product/PRODUCT-FACTBOOK.md` → paste the prompt below the `---` line.
   - `1-documentation.md` product documentation
   - `2-investor-summit-deck.md` investor / summit deck
   - `3-school-demo-deck.md` school (client) demo deck
   - `0-update-mode.md` refresh an existing deliverable after new features
3. Answer the founder questions (traction, pricing, funding) with real facts only; say "skip" otherwise.
4. Never let a deck claim live WhatsApp, a payment gateway or AI features (factbook section 7).
