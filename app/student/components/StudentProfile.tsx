'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import ChangePasswordCard from '@/app/components/ChangePasswordCard'
import BirthdayField from '@/app/components/BirthdayField'
import { StudentPageIntro } from './StudentExperience'
import { Sticker, type StickerName, type Tone } from './stickers'

type Student = {
  id: number; name: string; email: string | null; grade: string; section: string
  roll_number: string | null; parent_name: string | null; parent_phone: string | null
  phone: string | null; school_id: number; date_of_birth?: string | null; school_name?: string
}

export default function StudentProfile({ student }: { student: Student }) {
  const [dob, setDob] = useState(student.date_of_birth ?? null)
  const reduceMotion = useReducedMotion()
  const details: [string, string][] = [
    ['Roll number', student.roll_number || 'Not provided'],
    ['Email', student.email || 'Not provided'],
    ['Phone', student.phone || 'Not provided'],
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <StudentPageIntro eyebrow="Your account" title="My profile" sticker="identification-card" tone="pink"
        description="The details your school has connected to your student account."
        aside={<span className="sb-chip" data-size="lg" data-tone="mint"><Sticker name="shield" size="xs" />School-managed details</span>} />

      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 14, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="student-details-title" className="pt-2"
      >
        <div className="sb-id-card" data-testid="student-id-card">
          <span className="sb-id-slot" aria-hidden="true" />
          <div className="sb-id-band pt-8">
            <span className="min-w-0">
              <span className="block text-[11px] font-extrabold uppercase tracking-[.12em]">Student identity card</span>
              <span className="sb-display block truncate text-lg">{student.school_name ?? 'WeLearnYouLearn'}</span>
            </span>
            <Sticker name="graduation-cap" size="lg" tilt={12} />
          </div>
          <div className="flex flex-col gap-6 p-6 sm:flex-row">
            <span className="sb-id-photo" aria-hidden="true">{student.name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <h2 id="student-details-title" className="sb-display text-3xl">{student.name}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="sb-chip" data-tone="yellow">Grade {student.grade}</span>
                <span className="sb-chip" data-tone="blue">Section {student.section}</span>
              </div>
              <dl className="mt-4">
                {details.map(([label, value]) => (
                  <div key={label} className="sb-id-field"><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <div className="sb-barcode mx-6 mb-5" aria-hidden="true" />
        </div>
      </motion.section>

      <div className="grid gap-8 md:grid-cols-2">
        <ProfileCard sticker="birthday-cake" tone="pink" title="Birthday" titleId="student-birthday-title">
          <BirthdayField value={dob} endpoint="/api/student/auth/date-of-birth" kind="student" ring="focus:ring-amber-300" accentGradient="from-amber-700 to-orange-700" onSaved={setDob} />
          <p className="sb-hand mt-3 text-lg">so your class can celebrate with you</p>
        </ProfileCard>

        {(student.parent_name || student.parent_phone) && (
          <ProfileCard sticker="house" tone="mint" title="Parent or guardian" titleId="student-guardian-title">
            <dl>
              <div className="sb-id-field"><dt>Name</dt><dd>{student.parent_name || 'Not provided'}</dd></div>
              <div className="sb-id-field"><dt>Phone</dt><dd>{student.parent_phone || 'Not provided'}</dd></div>
            </dl>
          </ProfileCard>
        )}
      </div>

      <ProfileCard sticker="key" tone="yellow" title="Account security" titleId="student-security-title">
        <ChangePasswordCard endpoint="/api/student/auth/change-password" accentGradient="from-amber-700 to-orange-700" />
      </ProfileCard>
    </div>
  )
}

function ProfileCard({ sticker, tone, title, titleId, children }: { sticker: StickerName; tone: Tone; title: string; titleId: string; children: React.ReactNode }) {
  return (
    <section className="sb-card p-5 pt-7" data-tone="paper" aria-labelledby={titleId}>
      <Sticker name={sticker} size="lg" tilt={-10} className="sb-peek -top-7 right-5" />
      <span className="sb-kicker" data-tone={tone}>{title}</span>
      <h2 id={titleId} className="sr-only">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}
