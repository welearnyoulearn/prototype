'use client'

import { useState } from 'react'
import ChangePasswordCard from '@/app/components/ChangePasswordCard'
import BirthdayField from '@/app/components/BirthdayField'

type ParentInfo = { id: number; name: string; email: string; school_id: number; school_name: string; date_of_birth?: string | null }

type Props = { parentInfo: ParentInfo }

export default function ParentProfile({ parentInfo }: Props) {
  const [dob, setDob] = useState(parentInfo.date_of_birth ?? null)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-6 text-foreground">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 shrink-0 rounded-md bg-secondary text-primary flex items-center justify-center text-xl font-semibold" aria-hidden="true">
              {parentInfo.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{parentInfo.name}</h2>
              <p className="text-muted-foreground text-sm">{parentInfo.school_name}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Account Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Full Name" value={parentInfo.name} />
            <InfoRow label="Email" value={parentInfo.email || '—'} />
          </div>

          <BirthdayField
            value={dob}
            endpoint="/api/parent/auth/date-of-birth"
            kind="adult"
            ring="focus:ring-pink-300"
            accentGradient="from-pink-500 to-rose-500"
            onSaved={setDob}
          />
        </div>
      </div>

      <ChangePasswordCard endpoint="/api/parent/auth/change-password" accentGradient="from-pink-500 to-rose-500" />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
