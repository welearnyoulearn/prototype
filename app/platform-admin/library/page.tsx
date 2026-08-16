'use client'

import DigitalLibrary from '@/app/components/library/DigitalLibrary'

export default function PlatformLibraryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">Digital Library</h1>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <DigitalLibrary apiUrl="/api/platform/library" />
      </div>
    </div>
  )
}
