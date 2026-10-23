// Central API entitlement policy. Keep dependency-free for the Edge proxy.
export type ApiFeatureRequirement = { anyOf: readonly string[]; primary: string }

export const CLASS_READ_FEATURES = [
  'class-management', 'attendance', 'curriculum', 'exam-marks', 'library',
  'announcements', 'export', 'year-rollover', 'student-portal', 'parent-portal',
] as const
export const STUDENT_READ_FEATURES = [
  'students', 'class-management', 'attendance', 'exam-marks', 'fee-management',
  'curriculum', 'announcements', 'export', 'year-rollover',
] as const
export const TEACHER_ASSIGNMENT_FEATURES = [
  'staff', 'class-management', 'attendance', 'curriculum', 'exam-marks',
  'library', 'announcements',
] as const

const one = (primary: string): ApiFeatureRequirement => ({ anyOf: [primary], primary })
const any = (primary: string, anyOf: readonly string[]): ApiFeatureRequirement => ({ anyOf, primary })

export function featureRequirementForApiPath(pathname: string, method = 'GET'): ApiFeatureRequirement | null {
  const read = method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD'
  if (/^\/api\/teachers\/[^/]+\/change-password(?:\/|$)/.test(pathname)) return null
  if (/^\/api\/students\/[^/]+\/change-password(?:\/|$)/.test(pathname)) return null

  if (/^\/api\/teachers\/[^/]+\/class-subjects(?:\/|$)/.test(pathname) && read) return any('class-management', TEACHER_ASSIGNMENT_FEATURES)
  if (pathname === '/api/teachers' && read) return any('staff', ['staff', 'class-management'])
  if (pathname === '/api/teachers' || pathname.startsWith('/api/teachers/')) return one('staff')

  if (/^\/api\/students\/[^/]+\/exams(?:\/|$)/.test(pathname)) return one('exam-marks')
  if (pathname === '/api/students/promote' || pathname.startsWith('/api/students/promote/')) return one('year-rollover')
  if ((pathname === '/api/students' || pathname.startsWith('/api/students/')) && read) return any('students', STUDENT_READ_FEATURES)
  if (pathname === '/api/students' || pathname.startsWith('/api/students/')) return one('students')

  if ((pathname === '/api/classes' || pathname.startsWith('/api/classes/')) && read) return any('class-management', CLASS_READ_FEATURES)
  if (/^\/api\/classes\/[^/]+\/broadcast(?:\/|$)/.test(pathname)) return any('announcements', ['announcements', 'class-management'])
  if (pathname === '/api/classes' || pathname.startsWith('/api/classes/')) return one('class-management')

  if (pathname.startsWith('/api/fees/') || pathname === '/api/fees' || pathname.startsWith('/api/parent/fees')) return one('fee-management')
  if (pathname.startsWith('/api/expenses')) return one('expenses')
  if (pathname.startsWith('/api/attendance') || pathname.startsWith('/api/parent/attendance') || pathname.startsWith('/api/student/attendance')) return one('attendance')
  if (pathname.startsWith('/api/exams') || pathname.startsWith('/api/exam-notification-settings') || pathname.startsWith('/api/export/marks')) return one('exam-marks')
  if (pathname.startsWith('/api/export/attendance')) return one('attendance')
  if (pathname.startsWith('/api/school/subjects/materials')) return any('curriculum', ['curriculum', 'library'])
  if (pathname.startsWith('/api/syllabus') || pathname.startsWith('/api/school/custom/') || pathname.startsWith('/api/school/subjects')) return one('curriculum')
  if (pathname.startsWith('/api/school/library') || pathname.startsWith('/api/textbooks')) return one('library')
  if (pathname.startsWith('/api/materials/')) return any('library', ['library', 'feedback-management'])
  if (pathname.startsWith('/api/school-calendar')) return one('calendar')
  if (pathname.startsWith('/api/data-export')) return one('export')
  if (pathname.startsWith('/api/feedback/') && !pathname.startsWith('/api/feedback/resolve') && !pathname.startsWith('/api/feedback/submit') && !pathname.startsWith('/api/feedback/voice-upload-url')) return one('feedback-management')
  if (pathname.startsWith('/api/announcements')) return one('announcements')
  if (pathname.startsWith('/api/academic-years/rollover')) return one('year-rollover')
  return null
}

export function featureForApiPath(pathname: string): string | null {
  return featureRequirementForApiPath(pathname)?.primary ?? null
}

export const GATED_FEATURE_KEYS = [
  'staff', 'students', 'class-management', 'attendance', 'curriculum', 'exam-marks',
  'library', 'announcements', 'export', 'year-rollover', 'fee-management',
  'expenses', 'calendar', 'feedback-management',
] as const
