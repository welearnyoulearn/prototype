'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import ChangePasswordCard from '@/app/components/ChangePasswordCard'
import BirthdayField from '@/app/components/BirthdayField'
import AvatarPicker, { resolveAvatarSrc, type AvatarGender } from '@/app/components/AvatarPicker'

type Student = {
  id: number
  name: string
  email: string | null
  grade: string
  section: string
  roll_number: string | null
  parent_name: string | null
  parent_phone: string | null
  phone: string | null
  school_id: number
  date_of_birth?: string | null
  gender?: string | null
  avatar_url?: string | null
}

type Props = { student: Student }

export default function StudentProfile({ student }: Props) {
  const [dob, setDob] = useState(student.date_of_birth ?? null)
  const [avatarUrl, setAvatarUrl] = useState(student.avatar_url ?? null)
  const gender = (student.gender === 'male' || student.gender === 'female' ? student.gender : null) as AvatarGender
  const avatarSrc = resolveAvatarSrc(avatarUrl)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="relative bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8 text-white overflow-hidden">
          <div className="absolute -top-10 -right-6 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center gap-4">
            {avatarSrc ? (
              <motion.img
                src={avatarSrc}
                alt=""
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
                className="w-16 h-16 rounded-full object-cover ring-4 ring-white/25 flex-shrink-0"
              />
            ) : (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
                className="w-16 h-16 rounded-full bg-white/20 ring-4 ring-white/25 flex items-center justify-center text-2xl font-bold flex-shrink-0"
              >
                {student.name.charAt(0).toUpperCase()}
              </motion.div>
            )}
            <div>
              <h2 className="text-xl font-bold">{student.name}</h2>
              <p className="text-indigo-200 text-sm">
                Grade {student.grade} — Section {student.section}
                {student.roll_number && ` · Roll No. ${student.roll_number}`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Personal Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Full Name" value={student.name} delay={0.15} />
            <InfoRow label="Grade & Section" value={`Grade ${student.grade} – ${student.section}`} delay={0.19} />
            <InfoRow label="Roll Number" value={student.roll_number || '—'} delay={0.23} />
            <InfoRow label="Email" value={student.email || '—'} delay={0.27} />
            <InfoRow label="Phone" value={student.phone || '—'} delay={0.31} />
          </div>

          <BirthdayField
            value={dob}
            endpoint="/api/student/auth/date-of-birth"
            kind="student"
            ring="focus:ring-indigo-300"
            accentGradient="from-indigo-500 to-purple-600"
            onSaved={setDob}
          />

          <div>
            <h3 className="font-semibold text-gray-700 pt-2 mb-3">Avatar</h3>
            <AvatarPicker role="student" gender={gender} value={avatarUrl} accentColor="#6366f1" onSaved={setAvatarUrl} />
          </div>

          {(student.parent_name || student.parent_phone) && (
            <>
              <h3 className="font-semibold text-gray-700 pt-2">Parent / Guardian</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Parent Name" value={student.parent_name || '—'} delay={0.35} />
                <InfoRow label="Parent Phone" value={student.parent_phone || '—'} delay={0.39} />
              </div>
            </>
          )}
        </div>
      </div>

      <ChangePasswordCard endpoint="/api/student/auth/change-password" accentGradient="from-indigo-500 to-purple-600" />
    </motion.div>
  )
}

function InfoRow({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="bg-gray-50 rounded-xl px-4 py-3"
    >
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </motion.div>
  )
}
