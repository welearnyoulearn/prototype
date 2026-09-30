import Link from 'next/link'

export const metadata = { title: 'Privacy Policy · WeLearnYouLearn' }

// Public page (see PUBLIC_PREFIXES in proxy.ts). Google Play requires a
// privacy policy URL for the WLYL Parent app; this is the canonical one.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 p-6 text-sm leading-6 text-gray-800">
      <h1 className="text-xl font-semibold">WeLearnYouLearn — Privacy Policy</h1>
      <p className="text-gray-500">Last updated: 30 September 2026</p>

      <p>WeLearnYouLearn (WLYL) is a school management platform used by schools to run attendance, fees, examinations, timetables and announcements. It is used through the school admin, teacher, student and parent portals on this website and through the WLYL Parent mobile app. This policy explains what information the platform handles and why.</p>

      <h2 className="font-semibold">Who is responsible for your data</h2>
      <p>Your school is the account holder. It decides which records are entered into the platform and who can see them. WeLearnYouLearn processes that data on the school&apos;s behalf to provide the service.</p>

      <h2 className="font-semibold">Information the platform uses</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Login details</strong> (email or phone number and password), used only to sign you in. Passwords are stored hashed.</li>
        <li><strong>Profile</strong> (name, email, phone number, role and school).</li>
        <li><strong>School records</strong> entered by the school: class, roll number, attendance, fees and receipts, marks and results, timetable, remarks and announcements.</li>
        <li><strong>Fee payment records</strong> when a school enables online payments. Card and bank details are entered with the payment provider, never on this platform.</li>
      </ul>

      <h2 className="font-semibold">What the platform does not do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No advertising and no advertising identifiers.</li>
        <li>No analytics or tracking SDKs.</li>
        <li>No selling of data. Records are shared only with your school and, where the school enables it, with its payment or messaging provider to deliver that service.</li>
        <li>No location, contacts, camera or microphone access.</li>
      </ul>

      <h2 className="font-semibold">Storage and security</h2>
      <p>All traffic is encrypted in transit (HTTPS). A sign-in cookie is kept on your device so you stay signed in; signing out removes it. Provider secrets are encrypted at rest. Records are kept for as long as your school keeps its account.</p>

      <h2 className="font-semibold">Children</h2>
      <p>Student accounts are created by the school under its agreement with WeLearnYouLearn. The WLYL Parent app is for parents and guardians, not for children.</p>

      <h2 className="font-semibold">Your choices</h2>
      <p>You can change your password and sign out at any time. To correct a record or to delete an account, contact your school, which administers the account. The school can remove accounts and records from its admin portal.</p>

      <h2 className="font-semibold">Contact</h2>
      <p>WeLearnYouLearn · <Link className="underline" href="/">www.welearnyoulearn.com</Link></p>
    </main>
  )
}
