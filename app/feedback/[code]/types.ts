export type { FeedbackRole, AdvancedFormType } from '@/lib/feedback-defaults'
import type { FeedbackRole, AdvancedFormType } from '@/lib/feedback-defaults'

export interface FeedbackCategory {
  id: number
  role: FeedbackRole
  key: string
  label: string
  icon: string | null
  department: string | null
}

export type WizardStep = 'welcome' | 'identity' | 'categories' | 'rating' | 'advancedType' | 'advancedForm' | 'followup' | 'thankyou'

export const QUICK_PICKS = ['Great experience', 'Needs improvement', 'Urgent concern', 'Just a suggestion'] as const

// Per-type field definitions for the Advanced Forms flow (Meeting/Event/
// Exam/Academic) — pure UI config (labels, input types, options), unlike
// ADVANCED_FORM_TYPES in lib/feedback-defaults.ts which the server also
// needs (for validating advanced_form_type itself). The server stores
// whatever key/value pairs these fields produce as an opaque JSON blob, so
// adding or renaming a field here needs no API change.
export interface AdvancedFormField {
  key: string
  label: string
  type: 'text' | 'date' | 'select' | 'textarea'
  options?: string[]
  placeholder?: string
  required?: boolean
}

export const ADVANCED_FORM_FIELDS: Record<AdvancedFormType, AdvancedFormField[]> = {
  meeting: [
    { key: 'reason', label: 'What would you like to discuss?', type: 'textarea', required: true, placeholder: "e.g. My child's progress in Math" },
    { key: 'with', label: 'Meeting with', type: 'select', options: ['Class Teacher', 'Subject Teacher', 'Principal', 'Admin Office'], required: true },
    { key: 'preferred_date', label: 'Preferred date', type: 'date' },
    { key: 'preferred_time', label: 'Preferred time', type: 'select', options: ['Morning', 'Afternoon', 'Evening'] },
    { key: 'urgency', label: 'Urgency', type: 'select', options: ['Normal', 'Urgent'] },
  ],
  event: [
    { key: 'event_name', label: 'Event name', type: 'text', required: true, placeholder: 'e.g. Annual Sports Day' },
    { key: 'event_date', label: 'Event date', type: 'date' },
    { key: 'feedback_type', label: 'Type of feedback', type: 'select', options: ['Suggestion', 'Appreciation', 'Complaint'], required: true },
    { key: 'details', label: 'Details', type: 'textarea', required: true },
  ],
  exam: [
    { key: 'exam_name', label: 'Exam / subject', type: 'text', required: true },
    { key: 'exam_date', label: 'Exam date', type: 'date' },
    { key: 'concern_type', label: 'Concern type', type: 'select', options: ['Schedule Clash', 'Paper Issue', 'Result Query', 'Invigilation', 'Other'], required: true },
    { key: 'details', label: 'Details', type: 'textarea', required: true },
  ],
  academic: [
    { key: 'subject', label: 'Subject', type: 'text' },
    { key: 'grade_class', label: 'Grade / Class', type: 'text' },
    { key: 'concern_type', label: 'Concern type', type: 'select', options: ['Curriculum Pace', 'Homework Load', 'Teaching Quality', 'Resources', 'Other'], required: true },
    { key: 'details', label: 'Details', type: 'textarea', required: true },
  ],
}
