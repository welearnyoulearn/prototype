'use client'

import { useEffect, useState } from 'react'
import { SyllabusTracking, type TeacherObj } from './ClassView'
import { INK, GOLD, BORDER, CREAM } from '@/app/components/ulearn/theme'
import { Pills, UlearnCard } from '@/app/components/ulearn/primitives'

type ClassOption = {
  id: number
  grade: string
  section: string
  class_teacher_id: number | null
}

type TimetableSlot = {
  grade: string | null
  section: string | null
}

export default function TeacherSyllabus({
  teacher, schoolId, onGoToHomework,
}: {
  teacher: TeacherObj
  schoolId: number
  onGoToHomework: (classId: number) => void
}) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [activeKey, setActiveKey] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Same two sources MyClasses uses: the class they're class teacher of,
    // plus every class they hold a timetable slot for.
    Promise.all([
      fetch(`/api/timetable?teacher_id=${teacher.id}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([timetable, allClasses]: [TimetableSlot[], ClassOption[]]) => {
      const list = Array.isArray(allClasses) ? allClasses : []
      const picked = new Map<number, ClassOption>()

      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const own = list.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (own) picked.set(own.id, own)
      }
      ;(Array.isArray(timetable) ? timetable : []).forEach(slot => {
        const cls = list.find(c => c.grade === slot.grade && c.section === slot.section)
        if (cls) picked.set(cls.id, cls)
      })

      const found = Array.from(picked.values())
      setClasses(found)
      if (found.length > 0) setActiveKey(`${found[0].grade}-${found[0].section}`)
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading your classes…</div>

  if (classes.length === 0) {
    return (
      <UlearnCard className="p-6 text-center" borderColor={BORDER}>
        <div className="text-sm font-medium" style={{ color: INK }}>No classes assigned</div>
        <p className="text-sm text-gray-400 mt-1">
          You&apos;ll see a syllabus here once you&apos;re set as a class teacher or given timetable slots.
        </p>
      </UlearnCard>
    )
  }

  const active = classes.find(c => `${c.grade}-${c.section}` === activeKey) ?? classes[0]
  const isClassTeacher = active.class_teacher_id === teacher.id

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-4 sm:p-5" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
        <h2 className="text-lg font-semibold" style={{ color: INK }}>Syllabus</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Pick a class to track what&apos;s been taught and mark topics as covered.
        </p>
      </div>

      <Pills
        items={classes.map(c => `${c.grade}-${c.section}`)}
        value={activeKey}
        onChange={setActiveKey}
        color={GOLD}
      />

      <SyllabusTracking
        key={active.id}
        classId={active.id}
        schoolId={schoolId}
        grade={active.grade}
        teacher={teacher}
        isClassTeacher={isClassTeacher}
        onGoToHomework={() => onGoToHomework(active.id)}
      />
    </div>
  )
}
