'use client'

import { useState } from 'react'
import ChangePasswordCard from '@/app/components/ChangePasswordCard'
import BirthdayField from '@/app/components/BirthdayField'
import AvatarPicker, { resolveAvatarSrc, type AvatarGender } from '@/app/components/AvatarPicker'

type ParentInfo = {
  id: number; name: string; email: string; school_id: number; school_name: string
  date_of_birth?: string | null; gender?: string | null; avatar_url?: string | null
}

type Props = { parentInfo: ParentInfo }

export default function ParentProfile({ parentInfo }: Props) {
  const [dob, setDob] = useState(parentInfo.date_of_birth ?? null)
  const [avatarUrl, setAvatarUrl] = useState(parentInfo.avatar_url ?? null)
  const gender = (parentInfo.gender === 'male' || parentInfo.gender === 'female' ? parentInfo.gender : null) as AvatarGender
  const avatarSrc = resolveAvatarSrc(avatarUrl)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-8 text-white">
          <div className="flex items-center gap-4">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="w-16 h-16 rounded-full object-cover ring-4 ring-white/25" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                {parentInfo.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{parentInfo.name}</h2>
              <p className="text-pink-100 text-sm">{parentInfo.school_name}</p>
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

          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Avatar</h3>
            <AvatarPicker role="parent" gender={gender} value={avatarUrl} accentColor="#e11d48" onSaved={setAvatarUrl} />
          </div>
        </div>
      </div>

      <ChangePasswordCard endpoint="/api/parent/auth/change-password" accentGradient="from-pink-500 to-rose-500" />
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
