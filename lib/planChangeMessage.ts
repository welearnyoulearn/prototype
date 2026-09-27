// Wording for the "this would leave schools over their staff limit" confirmations shown to
// the platform admin. Client-safe (no server imports) so every screen says the same thing.

const LABEL: Record<string, string> = { none: 'No plan', basic: 'Basic', standard: 'Standard', premium: 'Premium' }
const label = (t: string) => LABEL[t] ?? t
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** 409 body from PUT /api/schools/{id}/subscription when a plan change leaves the school over its limit. */
export type OverSeatLimit = { tier: string; limit: number; active: number; excess: number }

export function overLimitMessage(d: OverSeatLimit): string {
  return (
    `This school has ${d.active} active staff accounts, but ${label(d.tier)} allows ${d.limit}.\n\n` +
    `Nobody is switched off — all ${d.active} accounts keep working. But until the school deactivates ` +
    `${plural(d.excess, 'account', 'accounts')} (or moves to a bigger plan) it can't add or reactivate staff accounts.\n\n` +
    `The school's administrators will be emailed. Apply the change anyway?`
  )
}

/** 409 body from POST /api/platform/features when a lowered plan limit pushes schools over. */
export type OverSeatLimitAffected = {
  tier: string; limit: number; count: number; schools: { id: number; name: string; active: number }[]
}[]

export function overLimitSchoolsMessage(affected: OverSeatLimitAffected): string {
  const lines = affected.map(a => {
    const names = a.schools.map(s => `${s.name} (${s.active} active)`).join(', ')
    const more = a.count > a.schools.length ? `, and ${a.count - a.schools.length} more` : ''
    return `• ${label(a.tier)} → limit ${a.limit}: ${plural(a.count, 'school', 'schools')} over — ${names}${more}`
  })
  return (
    `Lowering these limits leaves some schools with more active staff than the new limit:\n\n${lines.join('\n')}\n\n` +
    `Nobody is switched off. Those schools keep every account working but can't add or reactivate staff until they ` +
    `deactivate enough accounts or upgrade, and their administrators will be emailed. Save anyway?`
  )
}
