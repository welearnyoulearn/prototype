// Single source of truth for all school admin features.
// Only include features that have a working component wired in the school admin.
export const ALL_FEATURES = [
  // â”€â”€ Core â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'overview',           label: 'Overview Dashboard',              category: 'Core' },
  { key: 'staff',              label: 'Staff Directory & Onboarding',    category: 'Core' },
  { key: 'students',           label: 'Students List & Onboarding',      category: 'Core' },
  { key: 'class-management',   label: 'Class Management',                category: 'Core' },
  { key: 'student-portal',     label: 'Student Portal Access',           category: 'Core' },
  { key: 'parent-portal',      label: 'Parent Portal Access',            category: 'Core' },
  { key: 'library',            label: 'WLYL Digital Library',            category: 'Core' },

  // â”€â”€ Scheduling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'attendance',         label: 'Attendance Tracking',             category: 'Scheduling' },
  { key: 'leave-requests',     label: 'Leave Requests',                  category: 'Scheduling' },
  { key: 'emergency-cover',    label: 'Emergency Cover',                 category: 'Scheduling' },
  { key: 'timetable',          label: 'Timetable Management',            category: 'Scheduling' },
  { key: 'curriculum',         label: 'Syllabus Customizer',             category: 'Scheduling' },
  { key: 'exam-schedule',      label: 'Exam Schedule',                   category: 'Scheduling' },

  // â”€â”€ Analytics & Intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'briefing',           label: 'Daily Briefing',                  category: 'Analytics' },
  { key: 'analysis',           label: 'Studentâ€“Teacher Analysis',        category: 'Analytics' },
  { key: 'class-analytics',    label: 'Class Analytics',                 category: 'Analytics' },

  // â”€â”€ Communication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'announcements',      label: 'Announcement Board',              category: 'Communication' },
  { key: 'notifications',      label: 'Notification Center',             category: 'Communication' },
  { key: 'parent-engagement',  label: 'Parent Engagement',               category: 'Communication' },

  // â”€â”€ Finance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'fee-management',     label: 'Fee Management',                  category: 'Finance' },
  { key: 'expenses',           label: 'Expense Tracking',                category: 'Finance' },

  // â”€â”€ Administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'calendar',           label: 'Academic Calendar',               category: 'Administration' },
  { key: 'leaderboard',        label: 'Student Leaderboard',             category: 'Administration' },
  { key: 'export',             label: 'Export & Reports',                category: 'Administration' },
  { key: 'settings',           label: 'School Settings',                 category: 'Administration' },
  { key: 'year-rollover',      label: 'Year Rollover',                   category: 'Administration' },
  { key: 'year-review',        label: 'Year-in-Review Report',           category: 'Administration' },
  { key: 'api-monitoring',   label: 'Watchline (API Monitoring)',       category: 'Administration' },
]

export const CATEGORY_ORDER = ['Core', 'Scheduling', 'Analytics', 'Finance', 'Communication', 'Administration']

// Features that can be overridden per-school via school_feature_overrides,
// taking precedence over the tier-level plan_features setting.
export const OVERRIDABLE_FEATURE_KEYS = ['student-portal', 'parent-portal', 'api-monitoring']


