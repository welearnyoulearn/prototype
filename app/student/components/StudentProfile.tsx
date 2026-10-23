'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ContactRound, GraduationCap, ShieldCheck, UserRound } from 'lucide-react'
import ChangePasswordCard from '@/app/components/ChangePasswordCard'
import BirthdayField from '@/app/components/BirthdayField'
import { StudentPageIntro, studentReveal } from './StudentExperience'

type Student = {
  id: number; name: string; email: string | null; grade: string; section: string
  roll_number: string | null; parent_name: string | null; parent_phone: string | null
  phone: string | null; school_id: number; date_of_birth?: string | null
}

export default function StudentProfile({ student }: { student: Student }) {
  const [dob, setDob] = useState(student.date_of_birth ?? null)
  const reduceMotion = useReducedMotion()
  const studentDetails = [
    ['Full name', student.name],
    ['Grade and section', `Grade ${student.grade} · Section ${student.section}`],
    ['Roll number', student.roll_number || 'Not provided'],
    ['Email', student.email || 'Not provided'],
    ['Phone', student.phone || 'Not provided'],
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <StudentPageIntro eyebrow="Your account" title="My profile" description="Review the information your school has connected to your student account." aside={
        <div className="flex items-center gap-2 text-xs font-medium text-[#647068]"><ShieldCheck size={17} className="text-[#a85f16]" aria-hidden="true" />School-managed details</div>
      } />

      <section aria-labelledby="student-details-title">
        <div className="flex items-center gap-4 pb-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#f1e2ca] text-xl font-semibold text-[#6f3b0b]" aria-hidden="true">{student.name.charAt(0).toUpperCase()}</span>
          <div><h2 id="student-details-title" className="text-xl font-semibold tracking-tight text-[#202a25]">{student.name}</h2><p className="mt-1 text-sm text-[#68736b]">Grade {student.grade} · Section {student.section}</p></div>
        </div>
        <div className="divide-y divide-[#e2ded5] border-y border-[#dcd8cd]">
          {studentDetails.map(([label, value], index) => (
            <motion.div key={label} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible" className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <p className="text-xs font-semibold text-[#7a837c]">{label}</p>
              <p className="break-words text-sm font-medium text-[#29352f]">{value}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-[42px_1fr]" aria-labelledby="student-birthday-title">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f1e2ca] text-[#8b4a10]" aria-hidden="true"><UserRound size={18} /></span>
        <div className="min-w-0">
          <h2 id="student-birthday-title" className="mb-3 text-base font-semibold text-[#29352f]">Birthday</h2>
          <BirthdayField value={dob} endpoint="/api/student/auth/date-of-birth" kind="student" ring="focus:ring-amber-300" accentGradient="from-amber-700 to-orange-700" onSaved={setDob} />
        </div>
      </section>

      {(student.parent_name || student.parent_phone) && (
        <section className="grid gap-4 border-t border-[#dcd8cd] pt-7 sm:grid-cols-[42px_1fr]" aria-labelledby="student-guardian-title">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e6ece7] text-[#355d49]" aria-hidden="true"><ContactRound size={18} /></span>
          <div>
            <h2 id="student-guardian-title" className="text-base font-semibold text-[#29352f]">Parent or guardian</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Info label="Name" value={student.parent_name || 'Not provided'} />
              <Info label="Phone" value={student.parent_phone || 'Not provided'} />
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 border-t border-[#dcd8cd] pt-7 sm:grid-cols-[42px_1fr]" aria-labelledby="student-security-title">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e6ece7] text-[#355d49]" aria-hidden="true"><GraduationCap size={18} /></span>
        <div className="min-w-0"><h2 id="student-security-title" className="mb-3 text-base font-semibold text-[#29352f]">Account security</h2><ChangePasswordCard endpoint="/api/student/auth/change-password" accentGradient="from-amber-700 to-orange-700" /></div>
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-l-2 border-[#e2ded5] pl-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#8a928c]">{label}</p><p className="mt-1 break-words text-sm font-medium text-[#29352f]">{value}</p></div>
}
