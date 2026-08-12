'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DigitalLibrary from '@/app/components/library/DigitalLibrary'

export default function PlatformLibraryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link href="/platform-admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
        <DigitalLibrary apiUrl="/api/platform/library" />
      </div>
    </div>
  )
}
