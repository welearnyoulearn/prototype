'use client'

import TestCalendar from '../../components/TestCalendar'
import NotificationBell from '../../components/NotificationBell'

type Props = { teacherId: number; schoolId: number }

// Portal-wide exam schedule — every class this teacher is either the class
// teacher of or teaches a subject in (server-enforced in
// GET /api/exams/calendar via isTeacherLinkedToClass), not just the one
// class open in Class View. A class teacher sees every subject's exams for
// their class; a subject teacher sees exams across all their classes.
export default function TeacherExamSchedule({ teacherId, schoolId }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">Exam Schedule <NotificationBell teacherId={teacherId} group="exams" /></h2>
        <p className="text-sm text-gray-500">Every exam across your assigned classes and subjects — class teachers also see every subject for their own class.</p>
      </div>
      <TestCalendar mode="teacher" schoolId={schoolId} teacherId={teacherId} />
    </div>
  )
}
