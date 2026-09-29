'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import AttendanceCalendar from '../AttendanceCalendar'

/** A student's full attendance (calendar, %, trend) in an overlay — opened from any dashboard row. */
export default function StudentAttendanceModal({ studentId, name, onClose, onOpenProfile }: {
  studentId: number; name: string; onClose: () => void
  /** School admin only: jump to the student's complete profile. */
  onOpenProfile?: (studentId: number) => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose} data-testid="att-student-modal">
      <div role="dialog" aria-modal="true" aria-label={`${name} attendance`} onClick={e => e.stopPropagation()}
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-xl border border-gray-200 bg-gray-50 p-4 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200 sm:max-w-2xl sm:rounded-lg sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">{name}</h3>
            {onOpenProfile && (
              <button type="button" onClick={() => onOpenProfile(studentId)} data-testid="att-open-full-profile"
                className="inline-flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-md border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">Full profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></button>
            )}
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close attendance details" data-testid="att-student-modal-close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <AttendanceCalendar endpoint={`/api/attendance?view=student&student_id=${studentId}`} who="staff" />
      </div>
    </div>
  )
}
