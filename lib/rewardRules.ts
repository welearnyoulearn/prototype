// Rules shared by the Daily Newspaper and the Rewards Marketplace. Pure: no database, no clock.
// Points are one ledger (student_points): quiz, doubts and newspaper points all land in the same balance and
// the marketplace spends from it. Rewards are always shown to children, parents and schools in points only.

/** Points a child earns from one newspaper: for answering, and a bonus when the answer is right. */
export const NEWS_POINTS = { answered: 2, correct: 3 } as const

/** Most points' worth a child can order in one IST calendar month. Caps what any child can cost WLYL. */
export const MONTHLY_REDEEM_LIMIT = 500

export const NEWS_ACTIONS = ['news_answered', 'news_correct'] as const
export type NewsAction = (typeof NEWS_ACTIONS)[number]

export const NEWS_REF = 'news_edition'
export const ORDER_REF = 'marketplace_order'
export const REDEEM_ACTION = 'marketplace_redeem'
export const REFUND_ACTION = 'marketplace_refund'

/** True when ordering `cost` more points' worth stays within the monthly limit. */
export function withinMonthlyLimit(usedThisMonth: number, cost: number, limit: number = MONTHLY_REDEEM_LIMIT): boolean {
  return usedThisMonth + cost <= limit
}

/** What a child earns for one newspaper: 0 until they answer, 2 for answering, 5 for answering correctly. */
export function newsPointsEarned(answered: boolean, correct: boolean): number {
  if (!answered) return 0
  return NEWS_POINTS.answered + (correct ? NEWS_POINTS.correct : 0)
}

export type StarterItem = { name: string; emoji: string; pointsCost: number; unitCostPaise: number; sortOrder: number }

// The pilot catalog: simple, cheap stationery. Points are what everyone sees; unit cost is WLYL-only and a
// placeholder wholesale estimate (paise) to replace with real supplier quotes. About ₹0.02 per point for
// the cheapest items, and less per point for the dearer ones. Nothing may cost more than MONTHLY_REDEEM_LIMIT.
export const STARTER_ITEMS: readonly StarterItem[] = [
  { name: 'Pencil',     emoji: '✏️', pointsCost: 150, unitCostPaise: 300, sortOrder: 10 },
  { name: 'Eraser',     emoji: '🧽', pointsCost: 150, unitCostPaise: 300, sortOrder: 20 },
  { name: 'Sharpener',  emoji: '🔧', pointsCost: 150, unitCostPaise: 300, sortOrder: 30 },
  { name: 'Blue pen',   emoji: '🖊️', pointsCost: 250, unitCostPaise: 400, sortOrder: 40 },
  { name: 'Black pen',  emoji: '🖋️', pointsCost: 400, unitCostPaise: 400, sortOrder: 50 },
  { name: 'Ruler',      emoji: '📏', pointsCost: 500, unitCostPaise: 600, sortOrder: 60 },
  { name: 'Glue stick', emoji: '🧴', pointsCost: 500, unitCostPaise: 600, sortOrder: 70 },
]
