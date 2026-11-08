import type { Metadata } from 'next'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

export const metadata: Metadata = { title: 'Privacy Policy · WeLearnYouLearn' }

export default function PrivacyPage() {
  const info = legalInfo()
  return (
    <LegalPage title="Privacy Policy" current="/privacy">
      <p>
        This policy explains how {info.legalName} (&quot;{info.brand}&quot;, &quot;we&quot;) handles personal data in the {info.brand} school platform,
        in line with India&apos;s Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.
      </p>

      <h2>1. Who decides how data is used</h2>
      <ul>
        <li><strong>Data a school puts into the platform</strong> (students, parents, staff, attendance, marks, fees, messages): the school decides why it is collected and is responsible for it. We process it on the school&apos;s behalf, only to provide the platform.</li>
        <li><strong>Data about schools as our customers</strong> (administrator contact details, billing and payment records): we are responsible for it.</li>
      </ul>

      <h2>2. What we hold</h2>
      <ul>
        <li>Account details: names, email addresses, phone numbers, roles, and passwords (stored only in hashed form).</li>
        <li>School records entered by the school: student details, class, roll number, parent contact details, attendance, exam marks, fee records, announcements.</li>
        <li>Messages sent through the platform (email and other channels the school uses): recipient contact details and name, message text, delivery status. Passwords and reset links are never stored in message records.</li>
        <li>Payments: amount, date, payment reference and method. We never receive card numbers, UPI PINs or bank login details.</li>
        <li>Technical data needed to run the service securely: sign-in sessions, basic usage records and error logs.</li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>To provide the platform and its features to the school and its users.</li>
        <li>To send messages the school asks for, and account messages (login details and password resets).</li>
        <li>To bill schools, issue invoices and process payments and refunds.</li>
        <li>To keep the service secure, fix problems and improve it.</li>
      </ul>
      <p>We do not sell personal data and do not use it for advertising.</p>

      <h2>4. Children&apos;s data</h2>
      <p>
        The platform holds data about students, many of whom are under 18. Schools are responsible for obtaining verifiable consent from a parent or guardian
        where the law requires it. We do not track children for advertising or build behavioural profiles of them.
      </p>

      <h2>5. Who we share it with</h2>
      <p>Only with service providers who help us run the platform, under contracts that require them to protect it:</p>
      <ul>
        <li>Messaging and payment providers, when the school uses those features — they receive only what is needed to deliver a message or process a payment.</li>
        <li>Our hosting, database, email delivery and website-analytics providers (the analytics are cookieless and only on public pages).</li>
      </ul>
      <p>We may also disclose data when the law requires it.</p>

      <h2>6. Security and storage</h2>
      <p>Data is encrypted in transit, access is limited to people who need it, passwords are hashed, and each school can see only its own data. Data is stored with our hosting providers.</p>

      <h2>7. How long we keep it</h2>
      <p>We keep school data while the school uses the platform. After an account is closed we delete or anonymise it within a reasonable period, except records we must keep by law (for example invoices and payment records).</p>

      <h2>8. Your rights</h2>
      <ul>
        <li>Students, parents and staff can ask their school to access, correct or erase their data; we help the school do so.</li>
        <li>School administrators can write to us about their own data at <a href={`mailto:${info.email}`}>{info.email}</a>.</li>
      </ul>

      <h2>9. Cookies</h2>
      <p>We use only the cookies needed to keep you signed in securely. We do not use advertising cookies.</p>

      <h2>10. Grievance Officer</h2>
      <p>
        {info.grievanceOfficer}, {info.legalName}{info.address && `, ${info.address}`}. Email <a href={`mailto:${info.grievanceEmail}`}>{info.grievanceEmail}</a>.
        We acknowledge complaints within 24 hours and resolve them within 15 days.
      </p>

      <h2>11. Changes</h2>
      <p>We will update this page when our practices change and show the date of the latest version at the top.</p>
    </LegalPage>
  )
}
