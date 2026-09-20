# Extraction Plan — Rewards Marketplace (student, parent, admin) (issue #165)

Purpose: this branch (`feature/165-rewards-marketplace`) is the **preservation copy** of the Rewards Marketplace (student, parent, admin) feature exactly as it existed on `dev` before it was removed (see the removal PR that closes #165). No code is removed here — only this plan was added. Do **not** merge this branch as-is: it would re-add a feature that was deliberately taken out of `dev` because it was unstable / not fully implemented.

## Why it was removed
The screens are not reachable from any menu, and the API routes they call do not exist on `dev` (they return 404). `dev` was cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/parent/components/ParentMarketplace.tsx  (parent view / orders)
- app/school-admin/components/MarketplaceOrders.tsx  (admin: approve/deliver orders)
- app/student/components/StudentRewards.tsx  — the **whole screen** (points wallet, marketplace tab, hub/test activity). It was unreachable and built entirely on hub/test/marketplace points, so it was removed from dev in full.
- app/api/students/[id]/rewards/route.ts — the `marketplace_balance` / `marketplace_earned` figures and the `marketplace_orders` query.
- app/parent/translations.ts — the `marketplace` label (en/te).
- lib/rewards.ts — the `points_type: "marketplace"` option of `awardPoints`.

## 2. API routes it uses
- `/api/marketplace/items`, `/api/marketplace/order` (do not exist on dev; removed earlier in `046992f`)

## 3. Database
- Tables: `marketplace_items`, `marketplace_orders`.
- **Database:** tables are intentionally NOT dropped by the removal (schema history is never rewritten; migrations only add). They remain in `lib/db.ts` and simply have no UI/API on dev.

## 4. Shared code that was touched by the removal
- The rewards API (`GET /api/students/{id}/rewards`) and `lib/rewards.ts` are shared with the kept points/badges/streak data (used by the admin's student panel) — only the marketplace parts were cut from them.

## 5. Platform-Admin feature config
- **Not a Platform-Admin feature.** Student-independent; do NOT add it to `lib/features.ts` when restored.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/165-rewards-marketplace -- <the files listed in section 1>` (or cherry-pick from this branch).
2. Restore the missing API routes (they exist in git history before commit `046992f`, "wlylV1 — core school management platform (stripped for production)").
3. Re-apply the shared-code edits reversed (section 4).
4. Add the feature config / nav / docs described in section 5 (if any), run `node scripts/product-docs.mjs` if it exists on `dev`, and add an end-to-end test before merging.
