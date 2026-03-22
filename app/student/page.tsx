'use client'

import Link from 'next/link'

export default function StudentDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-semibold text-gray-800">Student Dashboard</h1>
        </div>
        <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-3 py-1 rounded-full">Student</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Student Dashboard</h2>
        <p className="text-gray-500">This dashboard will display your schedule, assignments, and grades.</p>
        <p className="text-gray-400 text-sm mt-2">Coming soon — linked to your school via School Admin.</p>
      </div>
    </div>
  )
}
