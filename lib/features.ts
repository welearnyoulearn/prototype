// Single source of truth for all school admin features
export const ALL_FEATURES = [
  // Core
  { key: 'overview',           label: 'Overview Dashboard',       category: 'Core' },
  { key: 'attendance',         label: 'Attendance',               category: 'Core' },
  { key: 'leave-requests',     label: 'Leave Requests',           category: 'Core' },
  { key: 'emergency-cover',    label: 'Emergency Cover',          category: 'Core' },
  { key: 'staff',              label: 'Staff (Directory + Onboarding)', category: 'Core' },
  { key: 'students',           label: 'Students (List + Onboarding)',  category: 'Core' },
  { key: 'class-management',   label: 'Class Management',         category: 'Core' },
  // Legacy keys — kept for feature config backward compat; UI now uses 'staff' and 'students'
  { key: 'teachers',           label: 'Teachers Management (legacy)',  category: 'Core' },
  { key: 'staff-onboarding',   label: 'Staff Onboarding (legacy)',     category: 'Core' },
  { key: 'student-onboarding', label: 'Student Onboarding (legacy)',   category: 'Core' },
  // Academic
  { key: 'timetable',          label: 'Timetable',                category: 'Academic' },
  { key: 'curriculum',         label: 'Syllabus Customizer',      category: 'Academic' },
  { key: 'exam-schedule',      label: 'Exam Schedule',            category: 'Academic' },
  { key: 'report-cards',       label: 'Report Cards',             category: 'Academic' },
  { key: 'analysis',           label: 'Student-Teacher Analysis', category: 'Academic' },
  // Analytics & Intelligence
  { key: 'class-analytics',    label: 'Class Analytics',          category: 'Analytics' },
  { key: 'academic-analytics', label: 'Academic Analytics',       category: 'Analytics' },
  { key: 'briefing',           label: 'Daily Briefing',           category: 'Analytics' },
  { key: 'school-health',      label: 'School Health Score',      category: 'Analytics' },
  { key: 'syllabus-predictor', label: 'Syllabus Predictor',       category: 'Analytics' },
  // Communication
  { key: 'announcements',      label: 'Announcement Board',       category: 'Communication' },
  { key: 'notifications',      label: 'Notification Center',      category: 'Communication' },
  { key: 'parent-engagement',  label: 'Parent Engagement',        category: 'Communication' },
  { key: 'class-pulse',        label: 'Anonymous Class Pulse',    category: 'Communication' },
  // Finance
  { key: 'fee-management',     label: 'Fee Management',           category: 'Finance' },
  // Administration
  { key: 'calendar',           label: 'Academic Calendar',        category: 'Administration' },
  { key: 'leaderboard',        label: 'Student Leaderboard',      category: 'Administration' },
  { key: 'export',             label: 'Export & Reports',         category: 'Administration' },
  { key: 'settings',           label: 'School Settings',          category: 'Administration' },
  { key: 'year-rollover',      label: 'Year Rollover',            category: 'Administration' },
  { key: 'year-review',        label: 'Year-in-Review Report',    category: 'Administration' },
]

export const CATEGORY_ORDER = ['Core', 'Academic', 'Analytics', 'Finance', 'Communication', 'Administration']
