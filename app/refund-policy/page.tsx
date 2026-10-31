import type { Metadata } from 'next'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

export const metadata: Metadata = { title: 'Refund & Cancellation Policy · WeLearnYouLearn' }

export default function RefundPolicyPage() {
  const info = legalInfo()
  return (
    <LegalPage title="Refund & Cancellation Policy" current="/refund-policy">
      <p>
        This policy explains when payments made to {info.legalName} (&quot;{info.brand}&quot;, &quot;we&quot;) for the {info.brand} school platform
        are refunded. Our customers are schools; payments are made by the school or on its behalf.
      </p>

      <h2>1. Plan subscriptions</h2>
      <ul>
        <li>Plan fees are charged for the plan period agreed with the school (monthly or yearly), as shown on the school&apos;s invoice.</li>
        <li>A plan can be cancelled at any time; it stays active until the end of the period already paid for.</li>
        <li>Plan fees for a period that has started are not refunded, including when a school closes its account during the period, unless the written agreement with the school says otherwise.</li>
        <li>A school that does not want its plan renewed should tell us before the plan ends; nothing is then charged for the next period.</li>
      </ul>

      <h2>2. Duplicate and mistaken payments</h2>
      <ul>
        <li>If a school pays the same bill twice, or pays more than the bill, we refund the extra amount to the account it came from.</li>
        <li>Refunds usually reach the school&apos;s account within 5–7 working days after we start them; the exact time depends on the bank.</li>
      </ul>

      <h2>3. How to ask for a refund or closure</h2>
      <p>
        The school&apos;s administrator writes to <a href={`mailto:${info.email}`}>{info.email}</a> with the school&apos;s name and, for a payment
        problem, the payment reference or date. We reply within 3 working days.
      </p>

      <h2>4. Contact</h2>
      <p>{info.legalName}{info.address && `, ${info.address}`}. Email <a href={`mailto:${info.email}`}>{info.email}</a>, phone {info.phone}.</p>
    </LegalPage>
  )
}
