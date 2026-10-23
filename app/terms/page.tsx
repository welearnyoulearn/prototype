import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

export const metadata: Metadata = { title: 'Terms & Conditions · WeLearnYouLearn' }

export default function TermsPage() {
  const info = legalInfo()
  return (
    <LegalPage title="Terms & Conditions" current="/terms">
      <p>
        These terms apply to the {info.brand} school platform (the &quot;Service&quot;) provided by {info.legalName} (&quot;{info.brand}&quot;, &quot;we&quot;, &quot;us&quot;)
        to schools (each a &quot;School&quot;) and to the people the School gives access to: its administrators, teachers, students and parents (&quot;Users&quot;).
        A written agreement signed with a School takes priority over these terms where they differ.
      </p>

      <h2>1. The Service</h2>
      <ul>
        <li>The Service is school-management software: student and staff records, attendance, exams and marks, fees, announcements, a digital library and related tools, with separate portals for school administrators, teachers, students and parents.</li>
        <li>Accounts for teachers, students and parents are created by the School. The School is responsible for who it gives access to and for keeping its information accurate.</li>
        <li>We may improve or change features. We will tell Schools in advance about changes that materially reduce what their plan includes.</li>
      </ul>

      <h2>2. Plans, prices and payment</h2>
      <ul>
        <li>Each School is on a plan (see <Link href="/pricing">Pricing</Link>) at the price agreed with it. Prices are in Indian rupees and GST is added as applicable.</li>
        <li>Invoices are issued for every bill and are available to the School&apos;s administrators in the platform. Unpaid bills are due within the period shown on the bill.</li>
        <li>A plan can be renewed, upgraded or downgraded by agreement. A School that does not want to renew should tell us before its plan ends.</li>
      </ul>

      <h2>3. Data</h2>
      <ul>
        <li>The School owns the data it puts into the Service. We process it only to provide the Service, as described in our <Link href="/privacy">Privacy Policy</Link>.</li>
        <li>The School is responsible for having a lawful basis, including any required consent, for the personal data it enters, especially data about children.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>Users must not misuse the Service: no attempts to access other Schools&apos; data, to disrupt the Service, or to use it for unlawful purposes. We may suspend access that puts other Users or the Service at risk.</p>

      <h2>5. Suspension, closure and termination</h2>
      <ul>
        <li>A School may close its account by writing to <a href={`mailto:${info.email}`}>{info.email}</a>. Refunds on closure follow the Refund &amp; Cancellation Policy.</li>
        <li>We may suspend or close a School&apos;s account if payments due are not made or these terms are seriously breached, after notice where reasonable.</li>
        <li>After closure we keep the School&apos;s data only as long as the law requires or the School asks us to, and can export it on request before deletion.</li>
      </ul>

      <h2>6. Third-party services</h2>
      <p>The Service relies on third parties, including email delivery and hosting providers. We are not responsible for their outages, but we choose reputable providers and will work to restore the Service quickly.</p>

      <h2>7. Liability</h2>
      <p>
        We provide the Service with reasonable care and skill. To the extent the law allows, our total liability to a School for any claim is limited to
        the amount the School paid us in the 12 months before the claim, and we are not liable for indirect or consequential loss.
      </p>

      <h2>8. Changes to these terms</h2>
      <p>We may update these terms. We will show the date of the latest version on this page and tell Schools about important changes in advance.</p>

      <h2>9. Law and disputes</h2>
      <p>These terms are governed by the laws of India. Courts in {info.jurisdictionCity} have jurisdiction.</p>

      <h2>10. Contact and grievances</h2>
      <p>
        {info.legalName}, {info.address}. Email <a href={`mailto:${info.email}`}>{info.email}</a>, phone {info.phone}.
        Grievance Officer: {info.grievanceOfficer}, <a href={`mailto:${info.grievanceEmail}`}>{info.grievanceEmail}</a>.
      </p>
    </LegalPage>
  )
}
