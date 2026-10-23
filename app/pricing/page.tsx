import type { Metadata } from 'next'
import Link from 'next/link'
import pool, { ensureDB } from '@/lib/db'
import LegalPage from '@/components/legal/LegalPage'

export const metadata: Metadata = { title: 'Pricing · WeLearnYouLearn' }
// Prices are read from Platform Admin's Plans & Pricing on every request, so this page never goes stale.
export const dynamic = 'force-dynamic'

type Plan = { tier: string; name: string; description: string | null; monthly: number | null; yearly: number | null }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })

async function load(): Promise<Plan[] | null> {
  try {
    await ensureDB()
    const { rows } = await pool.query<Plan>(
      `SELECT tier, display_name AS name, description, monthly_price::float8 AS monthly, yearly_price::float8 AS yearly
         FROM plan_pricing
        WHERE tier <> 'none' AND COALESCE(is_public, TRUE) AND COALESCE(is_active, TRUE)
        ORDER BY sort_order, monthly_price`)
    return rows
  } catch (err) {
    console.error('[pricing] load failed', err)
    return null
  }
}

export default async function PricingPage() {
  const plans = await load()
  return (
    <LegalPage title="Pricing" current="/pricing">
      <p>All prices are in Indian rupees. GST at 18% is added to every invoice.</p>

      <h2>Plans</h2>
      {plans && plans.length > 0 ? (
        <table data-testid="pricing-plans">
          <thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th></tr></thead>
          <tbody>{plans.map(p => (
            <tr key={p.tier}>
              <td><strong>{p.name}</strong>{p.description ? <span className="block text-sm text-[#626e66]">{p.description}</span> : null}</td>
              <td>{p.monthly != null && p.monthly > 0 ? inr(p.monthly) : 'On request'}</td>
              <td>{p.yearly != null && p.yearly > 0 ? inr(p.yearly) : 'On request'}</td>
            </tr>))}</tbody>
        </table>
      ) : <p>Plan prices are shared on request — <Link href="/contact">contact us</Link>.</p>}
      <p className="text-sm text-[#626e66]">The price agreed in a school&apos;s plan applies until its renewal. See the <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.</p>
    </LegalPage>
  )
}
