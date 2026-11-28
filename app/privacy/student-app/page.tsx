import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'
import { legalInfo } from '@/lib/legalInfo'

// Privacy policy for the WLYL Student Android app — the URL on its Google Play listing and behind
// Me → Privacy policy in the app. Public: no sign-in. Keep it in step with the app's Data safety form
// (wlyl-student-mobile: store/listing.md).
export const metadata: Metadata = { title: 'WLYL Student app — Privacy Policy · WeLearnYouLearn' }

const UPDATED = '28 November 2026'

export default function StudentAppPrivacyPage() {
  const info = legalInfo()
  return (
    <LegalPage title="WLYL Student app — Privacy Policy" current="/privacy/student-app">
      <p>Last updated {UPDATED}.</p>
      <p>
        This policy covers the WLYL Student app for Android (&quot;the app&quot;) from {info.brand}, operated by {info.legalName}. The app lets students of
        schools that use the {info.brand} (WLYL) school platform see their own school information and use their school&apos;s learning tools. It adds to
        our <Link href="/privacy">platform Privacy Policy</Link>. Questions: <a href={`mailto:${info.email}`}>{info.email}</a>.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Only students whose school uses WLYL can sign in. The school creates the account; the app has no sign-up.</li>
        <li>No advertising, no advertising IDs, and no tracking or analytics tools from other companies.</li>
        <li>We never sell students&apos; information or share it with anyone except their school and the services listed below that make the app work.</li>
        <li>Parents and the school can see what the student does in the learning tools, including AI tutor chats.</li>
      </ul>

      <h2>Children and schools</h2>
      <p>
        The app is made for school students, including children under 13. A student&apos;s account is created by their school, which is responsible for
        having permission from the student&apos;s parent or guardian to use WLYL, as part of enrolling the student and turning on student access. Parents can
        see their child&apos;s school records and AI tutor chats in the WLYL Parent app. If you are a parent and want your child&apos;s account switched off or
        deleted, ask the school, or write to us at the address above.
      </p>

      <h2>Who holds the school records</h2>
      <p>
        The student&apos;s school enters and owns the school records: attendance, exam marks, exam timetable, syllabus, calendar and notices. They are stored
        on the WLYL platform. The app only shows a student their own records.
      </p>

      <h2>What the app collects and why</h2>
      <ul>
        <li><strong>Sign-in details.</strong> The Student ID and password, sent to the WLYL platform to sign in. The app does not store the password. After sign-in, the phone keeps a session cookie so the student stays signed in until they sign out.</li>
        <li><strong>The student&apos;s profile</strong>, as recorded by the school: name, class and section, Student ID, school, and where the school added them, the student&apos;s email, phone and their parent&apos;s contact details. The student can add or change their own date of birth, which their classmates see as a birthday greeting on the day.</li>
        <li><strong>Learning activity.</strong> Daily quiz answers and points, the newspaper question answer, doubts the student sends to a teacher (the quiz question and any note they write), reports of quiz questions or AI answers that look wrong, birthday wishes sent to classmates (a fixed message), and acknowledgements of school notices. These go to the school through the WLYL platform so teachers can help.</li>
        <li><strong>AI tutor and AI hints.</strong> Where the school has the AI tutor, the student&apos;s questions and the chat are saved on the WLYL platform and are visible to their parents. To write answers, questions are sent to AI services: language models from Anthropic and OpenAI (through an AI gateway), Google Gemini for short quiz explanations, and Cloudflare to match questions to textbook pages. These services process the question only to produce the answer. The student&apos;s name and contact details are not sent to them.</li>
        <li><strong>App usage.</strong> Which parts of the app are opened and how long the app is used, recorded on the WLYL platform so the school can see whether its tools are used. This is not shared with other companies.</li>
        <li><strong>Notification token.</strong> If the student allows notifications, a push token for the device, so the school can send results, replies from teachers and reminders. It is removed when the student signs out, and when the school switches the account off. Notifications are delivered through Expo&apos;s push service and Google Firebase Cloud Messaging, which receive the token and the notification&apos;s text only to deliver it.</li>
        <li><strong>Hosting.</strong> The WLYL platform runs on Vercel and keeps its data in a Supabase database. They store and process it only on our behalf.</li>
      </ul>

      <h2>What stays on the phone</h2>
      <p>Settings only: light or dark theme, reduced motion, whether the welcome tour was seen, the last Student ID used (to fill in the sign-in box) and the day the morning greeting was last shown.</p>

      <h2>What the app does not do</h2>
      <ul>
        <li>No advertising and no advertising IDs.</li>
        <li>No analytics, tracking or crash-reporting tools from other companies.</li>
        <li>No access to location, contacts, camera, microphone, photos or files.</li>
        <li>No chat between students, no public profiles and no way for strangers to contact a student.</li>
        <li>No in-app purchases or payments.</li>
      </ul>

      <h2>Links that open outside the app</h2>
      <p>Textbooks, the source of a newspaper story and the AI Hub&apos;s links open in the phone&apos;s browser. Those pages are run by the school, the publisher or the AI provider and have their own privacy policies.</p>

      <h2>Security</h2>
      <p>All data between the app and the WLYL platform travels over encrypted HTTPS connections. Passwords are stored by the platform only as secure hashes.</p>

      <h2>How long data is kept</h2>
      <p>The student account is kept while the student&apos;s school uses WLYL and has the student enrolled. School records are kept by the school under its own record-keeping rules. AI tutor chats are kept with the student&apos;s account.</p>

      <h2>Deleting an account</h2>
      <p>See <Link href="/privacy/student-app/delete-account" data-testid="student-app-delete-link">Delete a WLYL Student account</Link>.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top of this page changes too. We tell schools about important changes.</p>
    </LegalPage>
  )
}
