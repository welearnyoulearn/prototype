// The email WLYL gets on every order: which school, who ordered what, and the school's running item counts for this
// month's run (the numbers WLYL buys and packs from). Sent after the response, through lib/email.ts.
import { escapeHtml } from '../email'
import { formatCounts, type PlacedOrder } from './service'

/** Where order alerts go. Defaults to the address the weekly usage digest already uses. */
export const rewardsAlertRecipient = () => process.env.REWARDS_ALERT_EMAIL?.trim() || 'kowsik@welearnyoulearn.com'

export function buildOrderAlert(placed: PlacedOrder, placedBy: 'student' | 'parent'): { subject: string; html: string } {
  const a = placed.alert
  const who = `${a.studentName}${a.className ? ` (${a.className})` : ''}`
  const subject = `New reward order — ${a.schoolName}`
  const rows = a.counts.map(c => `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(`${c.emoji ?? ''} ${c.name}`.trim())}</td><td style="text-align:right"><b>×${c.qty}</b></td></tr>`).join('')
  const html = [
    `<p><b>${escapeHtml(who)}</b> ordered 1 ${escapeHtml(placed.order.itemName)} (${placed.order.pointsCost} points)${placedBy === 'parent' ? ', placed by a parent' : ''}.</p>`,
    `<p>${escapeHtml(placed.run.label)} run so far for ${escapeHtml(a.schoolName)}: <b>${a.orders} order${a.orders === 1 ? '' : 's'}</b> · ${escapeHtml(formatCounts(a.counts))}</p>`,
    `<table style="border-collapse:collapse">${rows}</table>`,
    `<p style="color:#666">Platform Admin → Rewards shows every school's counts and the shopping list.</p>`,
  ].join('\n')
  return { subject, html }
}
