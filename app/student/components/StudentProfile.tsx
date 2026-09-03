'use client'

import ChangePasswordCard from '@/app/components/ChangePasswordCard'

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
}

type Props = { student: Student }

export default function StudentProfile({ student }: Props) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
              {student.name.charAt(0).toUpperCase()}
            </div>
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
            <InfoRow label="Full Name" value={student.name} />
            <InfoRow label="Grade & Section" value={`Grade ${student.grade} – ${student.section}`} />
            <InfoRow label="Roll Number" value={student.roll_number || '—'} />
            <InfoRow label="Email" value={student.email || '—'} />
            <InfoRow label="Phone" value={student.phone || '—'} />
          </div>

          {(student.parent_name || student.parent_phone) && (
            <>
              <h3 className="font-semibold text-gray-700 pt-2">Parent / Guardian</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Parent Name" value={student.parent_name || '—'} />
                <InfoRow label="Parent Phone" value={student.parent_phone || '—'} />
              </div>
            </>
          )}
        </div>
      </div>

      <ChangePasswordCard endpoint="/api/student/auth/change-password" accentGradient="from-indigo-500 to-purple-600" />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
