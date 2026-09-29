'use client'

import { useEffect, useState } from 'react'
import { InlineLoader } from '@/components/loaders'

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
  class_teacher_id: number | null
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
  onViewClass: (cls: { id: number; grade: string; section: string; class_teacher_name: string | null }) => void
  onGoToSyllabus: (cls: { id: number; grade: string; section: string; class_teacher_name: string | null }) => void
}

export default function MyClasses({ teacher, schoolId, onViewClass, onGoToSyllabus }: Props) {
  const [entries, setEntries] = useState<ClassEntry[]>([])
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    Promise.all([
      fetch(`/api/teachers/${teacher.id}/class-subjects`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([classSubjects, allClasses]: [ClassSubjectAssignment[], ClassOption[]]) => {
      const classMap = new Map<string, ClassEntry>()

      // Own class first
      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, { cls, subjects: [], isOwn: true })
      }

      // Subject teacher classes — from Class Management's class_subjects
      // assignment (a class is "theirs" the moment school-admin assigns it).
      classSubjects.forEach((a: ClassSubjectAssignment) => {
        if (!a.grade || !a.section) return
        const key = `${a.grade}-${a.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.id === a.class_id)
          if (cls) classMap.set(key, { cls, subjects: [], isOwn: false })
        }
        const entry = classMap.get(key)!
        if (!entry.subjects.includes(a.subject_name)) {
          entry.subjects.push(a.subject_name)
        }
      })

      setEntries(Array.from(classMap.values()))
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  if (loading) {
    return (
      <InlineLoader portal="teacher" label="Loading your classes…" size="lg" className="min-h-64" />
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
          <p className="text-muted-foreground text-sm">Ask your school admin to assign you a subject in Class Management.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">My Classes</h2>
        <p className="text-sm text-gray-500 mt-0.5">{entries.length} class{entries.length !== 1 ? 'es' : ''} assigned</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {entries.map(({ cls, subjects, isOwn }) => (
          <div key={cls.id} className="flex flex-col">
            {/* ── Own class card (Class Teacher) ── */}
            {isOwn ? (
              <div className="bg-white rounded-md border-2 border-blue-200 p-5  flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-3xl font-bold text-gray-900">{cls.grade}-{cls.section}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Your Class</span>
                    </div>
                    <p className="text-xs text-gray-500">Class Teacher</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">{cls.student_count}</p>
                    <p className="text-xs text-muted-foreground">Students</p>
                  </div>
                </div>

                {subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {subjects.map(s => (
                      <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => onViewClass({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Open Full Class View
                  </button>
                  <button
                    onClick={() => onGoToSyllabus({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                    title="Open Syllabus"
                    className="px-3 py-2.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              /* ── Other class card (Subject Teacher) ── */
              <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xl font-bold text-gray-900">{cls.grade}-{cls.section}</span>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Subject Teacher</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {cls.class_teacher_name ? `Class Teacher: ${cls.class_teacher_name}` : 'No class teacher assigned'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-700">{cls.student_count}</p>
                      <p className="text-xs text-muted-foreground">Students</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {subjects.length > 0 ? subjects.map(s => (
                      <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{s}</span>
                    )) : (
                      <span className="text-xs text-muted-foreground">No subject assigned</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => onViewClass({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open Class View
                    </button>
                    <button
                      onClick={() => onGoToSyllabus({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                      title="Open Syllabus"
                      className="px-3 py-2 border border-indigo-200 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      Syllabus
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
