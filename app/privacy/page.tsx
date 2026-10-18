import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'Privacy Policy · WeLearnYouLearn',
  description: 'How WeLearnYouLearn handles school, teacher, student and parent data across the web portals and the WLYL Parent app.',
}

// Public page (see PUBLIC_PREFIXES in proxy.ts). Google Play requires a
// privacy policy URL for the WLYL Parent app; this is the canonical one.
// Keep the facts in sync with the code: cookies in lib/auth.ts, providers in
// lib/email.ts / lib/encryption.ts, feature flags in lib/features.ts.

const LAST_UPDATED = '30 September 2026'
const CONTACT_EMAIL = 'privacy@welearnyoulearn.com'

const SECTIONS = [
  ['scope', 'Who this policy covers'],
  ['roles', 'Your school and us'],
  ['collect', 'Information we collect'],
  ['use', 'How we use it'],
  ['share', 'Who we share it with'],
  ['cookies', 'Cookies and device storage'],
  ['retention', 'How long we keep it'],
  ['security', 'How we protect it'],
  ['children', 'Students and children'],
  ['rights', 'Your rights and choices'],
  ['app', 'The WLYL Parent app'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact and grievances'],
] as const

const GLANCE = [
  ['No ads', 'No advertising, no ad identifiers, no ad networks.'],
  ['No selling', 'Records are never sold or rented to anyone.'],
  ['No tracking', 'No analytics or behavioural tracking SDKs.'],
  ['Encrypted', 'HTTPS everywhere; provider secrets encrypted at rest.'],
  ['School-controlled', 'Your school decides what is recorded and who sees it.'],
  ['Deletable', 'Ask your school to correct or remove your records.'],
]

const DATA_ROWS: [string, string, string, string][] = [
  ['Account and login', 'Name, email address, phone number, role, school, password (stored as a one-way hash)', 'Created by your school; password chosen by you', 'Sign you in and show you the right portal'],
  ['Student profile', 'Name, class and section, roll number, date of birth, guardian details', 'Entered by the school', 'Identify the student across attendance, fees and exams'],
  ['Attendance', 'Daily presence, absence and late marks; leave requests', 'Marked by teachers', 'Daily attendance registers and parent visibility'],
  ['Academic records', 'Exam schedules, marks, grades, result acknowledgements, timetable, homework, remarks', 'Entered by teachers and the school office', 'Report cards, results and day-to-day schooling'],
  ['Fees and payments', 'Fee structure, invoices, receipts, dues, waivers; online payment status and transaction reference', 'School office; payment provider when a parent pays online', 'Fee ledgers, receipts and reminders'],
  ['Communications', 'Announcements, notices, in-app messages, feedback submitted to the school', 'School staff and you', 'Keep parents and students informed'],
  ['Technical', 'Sign-in cookie, IP address and browser details in server logs', 'Your device, automatically', 'Keep you signed in, keep the service secure, diagnose faults'],
]

const PROVIDER_ROWS: [string, string, string, string][] = [
  ['Vercel', 'Hosts the application', 'All traffic to the platform', 'Always'],
  ['Supabase (PostgreSQL)', 'Stores the database', 'All records listed above', 'Always'],
  ['Resend', 'Sends transactional email', 'Recipient email address, message content (welcome and reset emails)', 'Always'],
  ['Cashfree Payments', 'Collects online fee payments', 'Payer name, contact, amount, order reference. Card and bank details go to Cashfree directly and never touch our servers', 'Only if your school enables online payments'],
  ['Meta (WhatsApp Business)', 'Delivers WhatsApp notifications', 'Phone number and message content', 'Only if your school enables WhatsApp'],
]

const COOKIE_ROWS: [string, string, string][] = [
  ['wlyl-auth', 'Keeps a school or platform administrator signed in', '7 days, or until sign-out'],
  ['wlyl-teacher', 'Keeps a teacher signed in', '7 days, or until sign-out'],
  ['wlyl-student', 'Keeps a student signed in', '7 days, or until sign-out'],
  ['wlyl-parent', 'Keeps a parent signed in', '7 days, or until sign-out'],
]

const RIGHTS: [string, string][] = [
  ['Access', 'See the records held about you or your child. Most are visible directly in your portal.'],
  ['Correction', 'Ask your school to fix anything inaccurate or out of date.'],
  ['Erasure', 'Ask your school to remove your account. The school can delete accounts and records from its admin portal.'],
  ['Withdraw consent', 'Where the school relies on your consent, for example WhatsApp notices, tell the school to stop.'],
  ['Nominate', 'Under the DPDP Act you may nominate a person to exercise these rights on your behalf.'],
  ['Complain', 'Raise a grievance with us using the contact below. If unresolved, you may approach the Data Protection Board of India.'],
]

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-slate-900">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{n}</span>
        {title}
      </h2>
      <div className="space-y-4 text-[15px] leading-7 text-slate-700">{children}</div>
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{head.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r[0]} className="align-top">
              {r.map((c, i) => <td key={i} className={`px-4 py-3 ${i === 0 ? 'font-medium text-slate-900' : 'text-slate-600'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PrivacyPage() {
  let n = 0
  const next = () => ++n
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <Link href="/" className="text-sm font-semibold text-indigo-300 hover:text-white" data-testid="privacy-home-link">← WeLearnYouLearn</Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Legal</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            How WeLearnYouLearn handles the information of schools, teachers, students and parents across the web portals and the WLYL Parent app.
          </p>
          <p className="mt-6 text-sm text-white/50">Last updated {LAST_UPDATED} · Effective immediately for all users</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GLANCE.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <span className="grid size-5 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">✓</span>{t}
              </p>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>

        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-14">
          <nav aria-label="Contents" className="mb-10 lg:sticky lg:top-8 lg:mb-0 lg:self-start">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Contents</p>
            <ol className="space-y-1.5 text-sm">
              {SECTIONS.map(([id, label], i) => (
                <li key={id}><a href={`#${id}`} className="flex gap-2 text-slate-600 hover:text-indigo-700"><span className="w-5 tabular-nums text-slate-400">{i + 1}.</span>{label}</a></li>
              ))}
            </ol>
          </nav>

          <article className="max-w-3xl space-y-14">
            <Section id="scope" n={next()} title="Who this policy covers">
              <p>WeLearnYouLearn (&ldquo;WLYL&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a school management platform. Schools use it to run attendance, fees, examinations, timetables and announcements. This policy applies to everyone who uses it:</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {[['School administrators', 'the school admin portal'], ['Teachers', 'the teacher portal'], ['Students', 'the student portal'], ['Parents and guardians', 'the parent portal and the WLYL Parent Android app']].map(([who, where]) => (
                  <li key={who} className="rounded-lg border border-slate-200 px-4 py-3"><span className="font-medium text-slate-900">{who}</span><span className="block text-sm text-slate-500">via {where}</span></li>
                ))}
              </ul>
              <p>It also covers the public parts of <span className="font-medium">www.welearnyoulearn.com</span>. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and Google Play&apos;s user-data requirements.</p>
            </Section>

            <Section id="roles" n={next()} title="Your school and us">
              <p>Your school is the <span className="font-medium text-slate-900">Data Fiduciary</span>. It decides which records are entered into the platform, who can see them and how long they are kept. It is the school that creates your account and sends you your login.</p>
              <p>WeLearnYouLearn is the <span className="font-medium text-slate-900">Data Processor</span>. We handle records only on the school&apos;s instructions and only to provide the service described here. We do not use school data for our own purposes, and we do not decide who gets access to it.</p>
              <div className="rounded-xl border-l-4 border-indigo-500 bg-indigo-50 px-5 py-4 text-sm text-indigo-950">
                In practice this means: questions about <em>what</em> is recorded about you or your child go to your school first. Questions about <em>how</em> the platform protects that data come to us.
              </div>
            </Section>

            <Section id="collect" n={next()} title="Information we collect">
              <p>Almost all of the information on the platform is entered by your school, not collected from you. Here is what is held, where it comes from and why.</p>
              <Table head={['Category', 'What it includes', 'Source', 'Why']} rows={DATA_ROWS} />
              <p className="text-sm text-slate-500">We do not collect location, contacts, photos, calendar, health data, device identifiers or biometric data. The platform does not request camera, microphone or location permissions.</p>
            </Section>

            <Section id="use" n={next()} title="How we use it">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><span className="font-medium text-slate-900">To run the school&apos;s day.</span> Attendance registers, fee ledgers, exam results, timetables and notices exist so the school, its teachers, its students and their parents see the same accurate record.</li>
                <li><span className="font-medium text-slate-900">To sign you in and keep you signed in.</span> Your login and a session cookie identify you and show you only what your role allows.</li>
                <li><span className="font-medium text-slate-900">To send necessary messages.</span> Welcome emails, password resets, and, where your school turns them on, fee reminders and notices by WhatsApp.</li>
                <li><span className="font-medium text-slate-900">To keep the service secure and working.</span> Server logs help us detect abuse and diagnose faults.</li>
              </ul>
              <p>We do not profile users, make automated decisions about them, or use their data to train models.</p>
            </Section>

            <Section id="share" n={next()} title="Who we share it with">
              <p>Records are shared with exactly two kinds of parties: <span className="font-medium text-slate-900">your school</span> (which owns them) and the <span className="font-medium text-slate-900">service providers</span> below, who process data on our behalf under contract and may not use it for anything else.</p>
              <Table head={['Provider', 'Role', 'Data involved', 'When']} rows={PROVIDER_ROWS} />
              <p>We will disclose information if the law requires it, for example a court order, and we will tell your school when we are allowed to. We never sell, rent or trade personal data.</p>
            </Section>

            <Section id="cookies" n={next()} title="Cookies and device storage">
              <p>The platform sets one strictly necessary cookie per portal. It holds a signed session token, is marked HttpOnly and Secure, and is removed when you sign out.</p>
              <Table head={['Cookie', 'Purpose', 'Lifetime']} rows={COOKIE_ROWS} />
              <p>There are no advertising, analytics or third-party cookies. The WLYL Parent app additionally remembers which child you last selected on the device itself; nothing else is cached.</p>
            </Section>

            <Section id="retention" n={next()} title="How long we keep it">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><span className="font-medium text-slate-900">School records</span> are kept for as long as the school holds an active account with us, because the school needs its historical registers and ledgers. When a school closes its account, its data is deleted from live systems within 90 days.</li>
                <li><span className="font-medium text-slate-900">Individual accounts</span> removed by the school are deleted from the live database at that time.</li>
                <li><span className="font-medium text-slate-900">Server logs</span> are retained for up to 30 days.</li>
                <li><span className="font-medium text-slate-900">Backups</span> roll over on a fixed schedule and are not used to restore individual records once they have been deleted.</li>
              </ul>
            </Section>

            <Section id="security" n={next()} title="How we protect it">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>All traffic uses HTTPS. There is no unencrypted access to the platform.</li>
                <li>Passwords are stored as salted one-way hashes. We cannot read them, and neither can your school.</li>
                <li>Payment and messaging credentials that schools enter are encrypted at rest with AES-256-GCM.</li>
                <li>Every request is checked against your role and your school, so a user from one school can never read another school&apos;s data.</li>
                <li>Access to production systems is limited to the engineers who operate them.</li>
              </ul>
              <p>If a breach affects your data we will notify your school, and the Data Protection Board where required, without undue delay.</p>
            </Section>

            <Section id="children" n={next()} title="Students and children">
              <p>Student accounts are created by the school under its agreement with us, on the basis of the consent the school obtains from parents at admission. We do not collect data directly from children, do not show them advertising and do not track their behaviour.</p>
              <p>The <span className="font-medium text-slate-900">WLYL Parent app is for parents and guardians</span>, not for children, and is listed on Google Play for adults only. Children&apos;s records shown in it are the school records described above.</p>
            </Section>

            <Section id="rights" n={next()} title="Your rights and choices">
              <p>You have the following rights over personal data about you or your child. Because your school administers the account, the fastest route is usually the school office; we will assist the school with any request.</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {RIGHTS.map(([t, d]) => (
                  <div key={t} className="rounded-lg border border-slate-200 p-4"><dt className="font-semibold text-slate-900">{t}</dt><dd className="mt-1 text-sm text-slate-600">{d}</dd></div>
                ))}
              </dl>
              <p>In the app and portals you can change your password and sign out at any time from the More or Profile screen.</p>
            </Section>

            <Section id="app" n={next()} title="The WLYL Parent app">
              <p>The Android app is a wrapper around the parent portal and follows every rule in this policy. Specifically:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>It requests <span className="font-medium text-slate-900">no device permissions</span>: no location, camera, contacts, storage or microphone.</li>
                <li>It contains no advertising or analytics SDKs.</li>
                <li>It talks only to your school&apos;s WeLearnYouLearn account over HTTPS.</li>
                <li>Fee payment, where enabled, opens your own UPI app with the amount pre-filled. The app never sees your bank or card details.</li>
                <li>Uninstalling the app removes everything it stored on the device. Your school records remain with the school.</li>
              </ul>
              <p>The Google Play data-safety declaration for the app mirrors sections 3, 5 and 7 of this policy.</p>
            </Section>

            <Section id="changes" n={next()} title="Changes to this policy">
              <p>We update this page when the platform changes in a way that affects your data. The date at the top always shows the current version. For material changes we notify schools in advance through the admin portal, and schools inform their users.</p>
            </Section>

            <Section id="contact" n={next()} title="Contact and grievances">
              <p>For privacy questions, data requests you could not resolve with your school, or to reach our Grievance Officer under the DPDP Act:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Email</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="mt-1 block font-medium text-indigo-700 underline" data-testid="privacy-contact-email">{CONTACT_EMAIL}</a>
                  <p className="mt-2 text-sm text-slate-500">We acknowledge within 72 hours and respond within 30 days.</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Website</p>
                  <Link href="/" className="mt-1 block font-medium text-indigo-700 underline">www.welearnyoulearn.com</Link>
                  <p className="mt-2 text-sm text-slate-500">WeLearnYouLearn · India</p>
                </div>
              </div>
            </Section>
          </article>
        </div>
      </div>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} WeLearnYouLearn · <Link href="/" className="underline hover:text-slate-800">Home</Link>
      </footer>
    </div>
  )
}
