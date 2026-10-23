import type { Metadata } from 'next'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

export const metadata: Metadata = { title: 'Contact Us · WeLearnYouLearn' }

export default function ContactPage() {
  const info = legalInfo()
  return (
    <LegalPage title="Contact Us" current="/contact">
      <table>
        <tbody>
          <tr><td className="w-48 font-medium">Company</td><td data-testid="contact-company">{info.brand} (operated by {info.legalName})</td></tr>
          {info.address && <tr><td className="font-medium">Registered address</td><td>{info.address}</td></tr>}
          {info.hasGstin && <tr><td className="font-medium">GSTIN</td><td>{info.gstin}</td></tr>}
          <tr><td className="font-medium">Email</td><td><a href={`mailto:${info.email}`}>{info.email}</a></td></tr>
          <tr><td className="font-medium">Phone</td><td>{info.phone}</td></tr>
          <tr><td className="font-medium">Support hours</td><td>Monday to Saturday, 10 am – 6 pm IST</td></tr>
          <tr><td className="font-medium">Grievance Officer</td><td>{info.grievanceOfficer} · <a href={`mailto:${info.grievanceEmail}`}>{info.grievanceEmail}</a></td></tr>
        </tbody>
      </table>
      <p>Students, parents and teachers: for help with your account, please contact your school office first — your school manages your login.</p>
      <p>Schools: write to us for billing, refunds, account closure or technical help. We reply within one working day.</p>
    </LegalPage>
  )
}
