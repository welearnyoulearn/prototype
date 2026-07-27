'use client'

import { useEffect, useState, useCallback } from 'react'
import StudentDetail from './StudentDetail'

type Teacher = {
  id: number
  name: string
  subject: string
  department: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type ClassOption = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
}

type Student = {
  id: number
  name: string
  roll_number: string
  grade: string
  section: string
  email: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  status: string
}

type ClassSubjectAssignment = {
  id: number
  subject_name: string
  class_id: number
  grade: string
  section: string
}

type Props = {
  teacher: Teacher
  schoolId: number
}

export default function MyStudents({ teacher, schoolId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // Student detail view — shared with ClassView's Students tab
  const [detailStudent, setDetailStudent] = useState<Student | null>(null)

  const isClassTeacher = teacher.class_teacher_grade === selectedClass?.grade &&
    teacher.class_teacher_section === selectedClass?.section

  useEffect(() => {
    Promise.all([
      fetch(`/api/teachers/${teacher.id}/class-subjects`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([classSubjects, allClasses]: [ClassSubjectAssignment[], ClassOption[]]) => {
      const classMap = new Map<string, ClassOption>()
      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, cls)
      }
      // Class Management's class_subjects assignment — same source used by
      // Syllabus/My Classes, not the timetable (a class is "theirs" the
      // moment it's assigned, with or without a timetable existing).
      classSubjects.forEach((a: ClassSubjectAssignment) => {
        if (!a.grade || !a.section) return
        const key = `${a.grade}-${a.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.id === a.class_id)
          if (cls) classMap.set(key, cls)
        }
      })
      const myClasses = Array.from(classMap.values())
      setClasses(myClasses)
      if (myClasses.length === 1) {
        setSelectedClass(myClasses[0])
      } else if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const own = myClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (own) setSelectedClass(own)
      }
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  const fetchStudents = useCallback(async (cls: ClassOption) => {
    setStudentsLoading(true)
    try {
      const data = await fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json()).catch(() => [])
      setStudents(Array.isArray(data) ? data : [])
    } finally {
      setStudentsLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    setDetailStudent(null)
    // Only the class teacher gets the full roster — a subject teacher sees
    // an explanatory message instead, so there's nothing to fetch for them.
    if (selectedClass && isClassTeacher) fetchStudents(selectedClass)
    else setStudents([])
  }, [selectedClass, isClassTeacher, fetchStudents])

  function openDetail(s: Student) {
    setDetailStudent(s)
  }

  const filtered = students.filter(s => {
    if (!searchQ.trim()) return true
    const q = searchQ.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.roll_number?.toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Class Assignments</h3>
          <p className="text-gray-400 text-sm">Ask your school admin to assign you a subject in Class Management.</p>
        </div>
      </div>
    )
  }

  // ── Student detail view ──────────────────────────────────────────────────
  if (detailStudent && selectedClass) {
    return (
      <StudentDetail
        student={detailStudent}
        classId={selectedClass.id}
        schoolId={schoolId}
        backLabel={`Back to ${selectedClass.grade}-${selectedClass.section} Students`}
        onBack={() => setDetailStudent(null)}
      />
    )
  }

  // ── Student list view ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">My Students</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedClass ? `${filtered.length} students · Grade ${selectedClass.grade}-${selectedClass.section}` : 'Select a class'}
          </p>
        </div>
        {selectedClass && (
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search name / roll…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        )}
      </div>

      {classes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 flex-shrink-0">Class</span>
          <div className="flex gap-2 flex-wrap">
            {classes.map(cls => (
              <button key={cls.id} onClick={() => setSelectedClass(cls)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedClass?.id === cls.id ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {cls.grade}-{cls.section}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedClass && !isClassTeacher && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Student list is restricted</h3>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Only the class teacher can view the full student list for {selectedClass.grade}-{selectedClass.section}.
            {selectedClass.class_teacher_name
              ? ` Contact ${selectedClass.class_teacher_name} if you need student details.`
              : ' No class teacher is assigned to this class yet.'}
          </p>
        </div>
      )}

      {selectedClass && isClassTeacher && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {studentsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {searchQ ? 'No students match your search' : 'No students enrolled in this class'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Total', val: filtered.length, cls: 'text-gray-900' },
                  { label: 'Active', val: filtered.filter(s => s.status === 'active').length, cls: 'text-green-600' },
                  { label: isClassTeacher ? 'With Parent Contact' : 'In This Class', val: isClassTeacher ? filtered.filter(s => s.parent_phone || s.parent_email).length : filtered.length, cls: 'text-blue-600' },
                ].map(item => (
                  <div key={item.label} className="px-6 py-3 text-center">
                    <p className={`text-xl font-bold ${item.cls}`}>{item.val}</p>
                    <p className="text-xs text-gray-400">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-gray-50">
                {filtered.map((s, idx) => (
                  <div key={s.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group"
                    onClick={() => openDetail(s)}
                  >
                    <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.roll_number || 'No roll no.'}{s.email ? ` · ${s.email}` : ''}</p>
                    </div>
                    {isClassTeacher && s.parent_phone && (
                      <a href={`tel:${s.parent_phone}`} onClick={e => e.stopPropagation()}
                        className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {s.parent_phone}
                      </a>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
