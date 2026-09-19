'use client'

import SyllabusTracking from './SyllabusTracking'

// ── Main Component ─────────────────────────────────────────────────────────
// The Syllabus Coverage tab is owned entirely by SyllabusTracking.tsx (its
// own class/teacher two-pane list+detail+trend-chart screen) — this
// component is a thin wrapper around it now that the Tasks & Assignments
// tab (Homework feature, #136) has been removed.

export default function AcademicAnalytics({ schoolId }: { schoolId: number }) {
  return (
    <div className="space-y-5">
      <SyllabusTracking schoolId={schoolId} />
    </div>
  )
}
