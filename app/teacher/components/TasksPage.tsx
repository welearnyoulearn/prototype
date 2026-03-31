'use client'

import { useEffect, useState } from 'react'
import Tasks from './Tasks'

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

type TimetableSlot = {
  grade: string | null
  section: string | null
}

type Props = {
  teacher: Teacher
  schoolId: number
}

export default function TasksPage({ teacher, schoolId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/timetable?teacher_id=${teacher.id}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([timetable, allClasses]: [TimetableSlot[], ClassOption[]]) => {
      // Build set of classes this teacher is associated with
      const classMap = new Map<string, ClassOption>()

      // Class teacher's own class first
      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(
          c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section
        )
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, cls)
      }

      // Subject teacher classes from timetable
      timetable.forEach((slot: TimetableSlot) => {
        if (!slot.grade || !slot.section) return
        const key = `${slot.grade}-${slot.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.grade === slot.grade && c.section === slot.section)
          if (cls) classMap.set(key, cls)
        }
      })

      const myClasses = Array.from(classMap.values())
      setClasses(myClasses)

      // Auto-select if only one class, or if class teacher — select their class
      if (myClasses.length === 1) {
        setSelectedClass(myClasses[0])
      } else if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const own = myClasses.find(
          c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section
        )
        if (own) setSelectedClass(own)
      }
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

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
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Classes Found</h3>
          <p className="text-gray-400 text-sm">You have no class assignments yet. Ask admin to set up your timetable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Class selector — shown when teacher has multiple classes */}
      {classes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 flex-shrink-0">Class</span>
          <div className="flex gap-2 flex-wrap">
            {classes.map(cls => (
              <button
                key={cls.id}
                onClick={() => setSelectedClass(cls)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedClass?.id === cls.id
                    ? 'bg-slate-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cls.grade}-{cls.section}
              </button>
            ))}
          </div>
          {selectedClass && (
            <span className="ml-auto text-xs text-gray-400">
              {teacher.class_teacher_grade === selectedClass.grade && teacher.class_teacher_section === selectedClass.section
                ? 'Your Class'
                : 'Subject Class'}
            </span>
          )}
        </div>
      )}

      {/* Tasks component */}
      {selectedClass ? (
        <div className="flex-1 min-h-0">
          <Tasks
            key={selectedClass.id}
            classId={selectedClass.id}
            grade={selectedClass.grade}
            section={selectedClass.section}
            schoolId={schoolId}
            teacher={teacher}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full min-h-[300px] bg-white rounded-xl border border-gray-200">
          <div className="text-center">
            <p className="text-gray-500 font-medium mb-1">Select a class above to manage tasks</p>
            <p className="text-gray-400 text-sm">You teach {classes.length} classes</p>
          </div>
        </div>
      )}
    </div>
  )
}
