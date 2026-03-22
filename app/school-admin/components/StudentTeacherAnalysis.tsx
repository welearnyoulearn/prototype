'use client'

import { useEffect, useState } from 'react'

type Props = { schoolId: number }

type Teacher = { id: number; name: string; subject: string; department: string; status: string }
type Student = { id: number; name: string; grade: string; section: string; status: string }
type LeaveRequest = { status: string }

export default function StudentTeacherAnalysis({ schoolId }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [t, s, l] = await Promise.all([
          fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/students?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/leave-requests?school_id=${schoolId}`).then(r => r.json()),
        ])
        setTeachers(Array.isArray(t) ? t : [])
        setStudents(Array.isArray(s) ? s : [])
        setLeaves(Array.isArray(l) ? l : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [schoolId])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading analysis...</div>

  // Compute stats
  const ratio = teachers.length > 0 ? (students.length / teachers.length).toFixed(1) : '—'

  const gradeMap: Record<string, number> = {}
  students.forEach(s => {
    const key = s.grade ? `Grade ${s.grade}` : 'Unknown'
    gradeMap[key] = (gradeMap[key] || 0) + 1
  })
  const gradeEntries = Object.entries(gradeMap).sort(([a], [b]) => a.localeCompare(b))
  const maxGradeCount = Math.max(...Object.values(gradeMap), 1)

  const departmentMap: Record<string, number> = {}
  teachers.forEach(t => {
    const key = t.department || 'General'
    departmentMap[key] = (departmentMap[key] || 0) + 1
  })
  const deptEntries = Object.entries(departmentMap).sort(([, a], [, b]) => b - a)

  const leaveStats = {
    pending: leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  }

  const sectionMap: Record<string, number> = {}
  students.forEach(s => {
    if (s.grade && s.section) {
      const key = `${s.grade}-${s.section}`
      sectionMap[key] = (sectionMap[key] || 0) + 1
    }
  })
  const sectionEntries = Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Student-Teacher Analysis</h2>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Teachers</p>
          <p className="text-3xl font-bold text-blue-600">{teachers.length}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Students</p>
          <p className="text-3xl font-bold text-green-600">{students.length}</p>
        </div>
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Student : Teacher Ratio</p>
          <p className="text-3xl font-bold text-violet-600">{ratio}</p>
          {teachers.length > 0 && <p className="text-xs text-gray-400 mt-1">{ratio} students per teacher</p>}
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Leave Requests</p>
          <p className="text-3xl font-bold text-orange-600">{leaves.length}</p>
          {leaveStats.pending > 0 && <p className="text-xs text-orange-500 mt-1">{leaveStats.pending} pending</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade-wise student distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Students by Grade</h3>
          {gradeEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No students enrolled yet</p>
          ) : (
            <div className="space-y-3">
              {gradeEntries.map(([grade, count]) => (
                <div key={grade}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{grade}</span>
                    <span className="text-gray-500">{count} student{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(count / maxGradeCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teacher department distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Teachers by Department</h3>
          {deptEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No teachers onboarded yet</p>
          ) : (
            <div className="space-y-3">
              {deptEntries.map(([dept, count]) => (
                <div key={dept} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{dept}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / teachers.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leave request summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Leave Request Summary</h3>
          {leaves.length === 0 ? (
            <p className="text-gray-400 text-sm">No leave requests yet</p>
          ) : (
            <div className="space-y-3">
              {([
                { key: 'pending', label: 'Pending', color: 'bg-orange-500', count: leaveStats.pending },
                { key: 'approved', label: 'Approved', color: 'bg-green-500', count: leaveStats.approved },
                { key: 'rejected', label: 'Rejected', color: 'bg-red-500', count: leaveStats.rejected },
              ] as const).map(item => (
                <div key={item.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="text-gray-500">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full transition-all`}
                      style={{ width: leaves.length > 0 ? `${(item.count / leaves.length) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class-section wise student count */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Students by Class-Section</h3>
          {sectionEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No class data available</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sectionEntries.map(([key, count]) => (
                <div key={key} className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">{key}</span>
                  <span className="text-sm text-gray-500 font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
