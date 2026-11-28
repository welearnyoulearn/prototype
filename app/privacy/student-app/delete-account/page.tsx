import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

// Account deletion for the WLYL Student Android app — the deletion URL on its Google Play Data safety
// form and behind Me → Delete my account in the app. Public: no sign-in.
export const metadata: Metadata = { title: 'Delete a WLYL Student account · WeLearnYouLearn' }

export default function StudentAppDeleteAccountPage() {
  const info = legalInfo()
  const mail = `mailto:${info.email}?subject=${encodeURIComponent('Delete my WLYL Student account')}`
  return (
    <LegalPage title="Delete a WLYL Student account" current="/privacy/student-app/delete-account">
      <p>WLYL Student is the student app from {info.brand}. A student&apos;s account is created by their school. To delete it, either:</p>
      <ul>
        <li><strong>Ask the school</strong> to remove the student from WLYL. This switches the account off at once.</li>
        <li>
          Or <strong>email us</strong> at <a href={mail} data-testid="student-app-delete-email">{info.email}</a> with the subject <em>Delete my WLYL Student account</em>.
          A parent or guardian can ask for their child. Include the student&apos;s name, Student ID (if known), class and school, so we can find the right
          account. We confirm by email, tell the school, and complete the deletion within 30 days.
        </li>
      </ul>

      <h2>What is deleted</h2>
      <ul>
        <li>The student login: the password and the profile details the student added (date of birth).</li>
        <li>Notification tokens for the student&apos;s phones.</li>
        <li>AI tutor chats, AI hints, quiz answers, points, doubts, reports and birthday wishes.</li>
      </ul>

      <h2>What is kept</h2>
      <p>School records (attendance, exam marks and the school&apos;s own register of the student) belong to the school and are kept under the school&apos;s own record-keeping rules. To ask about those, contact the school.</p>
      <p>Signing out of the app removes the notification token from the phone. Uninstalling the app removes everything it stored on the phone.</p>
      <p>See also the <Link href="/privacy/student-app">WLYL Student app privacy policy</Link>.</p>
    </LegalPage>
  )
}
