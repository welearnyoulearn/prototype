// Small shared pieces for the marketplace API routes.
import { NextResponse } from 'next/server'
import type { OrderRefusal } from './service'

export const FEATURE = 'rewards-marketplace'

export const featureOff = () =>
  NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: FEATURE }, { status: 403 })

const REFUSAL_TEXT: Record<OrderRefusal, string> = {
  insufficient: 'Not enough points yet.',
  monthly_limit: 'That would go over this month’s 500-point limit. Try again next month.',
  already_spent: 'That order was already placed.',
  item_unavailable: 'That item is not available right now.',
  student_not_found: 'Student not found.',
}

export const refused = (reason: OrderRefusal) =>
  NextResponse.json({ error: REFUSAL_TEXT[reason], reason }, { status: reason === 'student_not_found' ? 404 : 409 })
