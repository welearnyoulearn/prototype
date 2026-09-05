'use client'

import { useEffect, useState } from 'react'
import DigitalLibrary from '../../components/library/DigitalLibrary'

type Teacher = {
  id: number
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type ClassOption = {
  id: number
  grade: string
  section: string
  student_count: number
}

type ClassSubjectAssignment = {
  id: number
  subject_name: string
  class_id: number
  grade: string
  section: string
}

type ClassEntry = {
  cls: ClassOption
  subjects: string[]
  isOwn: boolean
}

type Props = {
  teacher: Teacher
  schoolId: number
}

// Teacher's own entry point into the Digital Library — picks a class first
// (same assignment source as MyClasses: class_teacher_grade/section for the
// teacher's own class, class_subjects for everything else), then shows only
// that class's own textbooks/handbooks via DigitalLibrary's class_id filter.
export default function TeacherLibrary({ teacher, schoolId }: Props) {
  const [entries, setEntries] = useState<ClassEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassEntry | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/teachers/${teacher.id}/class-subjects`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([classSubjects, allClasses]: [ClassSubjectAssignment[], ClassOption[]]) => {
      const classMap = new Map<string, ClassEntry>()

      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, { cls, subjects: [], isOwn: true })
      }

      classSubjects.forEach((a: ClassSubjectAssignment) => {
        if (!a.grade || !a.section) return
        const key = `${a.grade}-${a.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.id === a.class_id)
          if (cls) classMap.set(key, { cls, subjects: [], isOwn: false })
        }
        const entry = classMap.get(key)!
        if (!entry.subjects.includes(a.subject_name)) entry.subjects.push(a.subject_name)
      })

      setEntries(Array.from(classMap.values()))
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (selectedClass) {
    return (
      <div>
        <button
          onClick={() => setSelectedClass(null)}
          data-testid="teacher-library-back"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All classes
        </button>
        <div className="mb-4">
          <span className="text-lg font-bold text-gray-900">Grade {selectedClass.cls.grade}-{selectedClass.cls.section}</span>
          <span className="text-sm text-gray-400 ml-2">Digital Library</span>
        </div>
        <DigitalLibrary apiUrl={`/api/school/library?school_id=${schoolId}&class_id=${selectedClass.cls.id}`} />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Classes Assigned</h3>
          <p className="text-gray-400 text-sm">Ask your school admin to assign you a subject in Class Management.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Digital Library</h2>
        <p className="text-sm text-gray-500 mt-0.5">Choose a class to see its textbooks and handbooks.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {entries.map(({ cls, subjects, isOwn }) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClass({ cls, subjects, isOwn })}
            data-testid={`teacher-library-class-${cls.id}`}
            className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-gray-900">{cls.grade}-{cls.section}</span>
                  {isOwn && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Your Class</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {subjects.length > 0 ? subjects.map(s => (
                    <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                  )) : (
                    <span className="text-xs text-gray-400">No subject assigned</span>
                  )}
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
