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

type ClassSubjectAssignment = {
  id: number
  subject_name: string
  class_id: number
  grade: string
  section: string
}

export default function TeacherSyllabus({
  teacher, schoolId, academicYear, readOnly,
}: {
  teacher: TeacherObj
  schoolId: number
  academicYear?: string
  readOnly?: boolean
}) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [assignments, setAssignments] = useState<ClassSubjectAssignment[]>([])
  const [activeKey, setActiveKey] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Class visibility comes from two sources: the class they're class
    // teacher of (they oversee the whole class regardless of subject), plus
    // every (class, subject) pair Class Management explicitly assigned them
    // via class_subjects — replacing the old "any timetable slot" heuristic,
    // which let a teacher see subjects that weren't actually theirs.
    Promise.all([
      fetch(`/api/teachers/${teacher.id}/class-subjects`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([classSubjects, allClasses]: [ClassSubjectAssignment[], ClassOption[]]) => {
      const list = Array.isArray(allClasses) ? allClasses : []
      const picked = new Map<number, ClassOption>()

      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const own = list.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (own) picked.set(own.id, own)
      }
      const assigned = Array.isArray(classSubjects) ? classSubjects : []
      assigned.forEach(a => {
        const cls = list.find(c => c.id === a.class_id)
        if (cls) picked.set(cls.id, cls)
      })

      const found = Array.from(picked.values())
      setClasses(found)
      setAssignments(assigned)
      // Only auto-select on first load — activeKey starts '' and the caller
      // (page.tsx) passes `teacher` as a fresh object literal every render,
      // so this effect can refire on any unrelated parent re-render. Without
      // this guard, that refire unconditionally snapped a teacher's manual
      // class-pill selection back to the first class every time.
      setActiveKey(prev => prev || (found.length > 0 ? `${found[0].grade}-${found[0].section}` : prev))
    }).finally(() => setLoading(false))
  }, [teacher.id, teacher.class_teacher_grade, teacher.class_teacher_section, schoolId])

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading your classes…</div>

  if (classes.length === 0) {
    return (
      <UlearnCard className="p-6 text-center" borderColor={BORDER}>
        <div className="text-sm font-medium" style={{ color: INK }}>No classes assigned</div>
        <p className="text-sm text-gray-400 mt-1">
          You&apos;ll see a syllabus here once you&apos;re set as a class teacher or assigned a subject in Class Management.
        </p>
      </UlearnCard>
    )
  }

  const active = classes.find(c => `${c.grade}-${c.section}` === activeKey) ?? classes[0]
  const isClassTeacher = active.class_teacher_id === teacher.id
  const allowedSubjects = assignments.filter(a => a.class_id === active.id).map(a => a.subject_name)

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
        allowedSubjects={allowedSubjects}
        academicYear={academicYear}
        readOnly={readOnly}
      />
    </div>
  )
}
