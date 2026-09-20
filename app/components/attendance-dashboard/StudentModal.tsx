'use client'

import { useEffect } from 'react'
import AttendanceCalendar from '../AttendanceCalendar'

/** A student's full attendance (calendar, %, trend) in an overlay — opened from any dashboard row. */
export default function StudentAttendanceModal({ studentId, name, onClose }: { studentId: number; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose} data-testid="att-student-modal">
      <div role="dialog" aria-modal="true" aria-label={`${name} attendance`} onClick={e => e.stopPropagation()}
        className="bg-gray-50 w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">{name}</h3>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="att-student-modal-close"
            className="w-9 h-9 rounded-xl text-gray-500 hover:bg-gray-200 text-lg">✕</button>
        </div>
        <AttendanceCalendar endpoint={`/api/attendance?view=student&student_id=${studentId}`} who="staff" />
      </div>
    </div>
  )
}
