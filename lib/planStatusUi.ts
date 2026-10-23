import type { PlanStatus } from '@/lib/planExpiry'

// Badge look shared by the platform screens. `label` reads "Ends in 12d" / "Grace · 5d left" etc.
export const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  none: 'hidden',
  active: 'bg-green-50 text-green-700 border-green-200',
  expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  grace: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
}

export function planStatusLabel(status: PlanStatus, daysLeft: number | null, graceEnds: string | null, endDate: string | null): string {
  switch (status) {
    case 'none': return ''
    case 'active': return endDate ? `Until ${endDate}` : 'Active'
    case 'expiring': return daysLeft === 0 ? 'Ends today' : `Ends in ${daysLeft}d`
    case 'grace': return `Ended · grace to ${graceEnds}`
    case 'expired': return `Expired ${endDate ?? ''}`.trim()
  }
}
