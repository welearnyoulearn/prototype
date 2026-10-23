export type { FeedbackRole, AdvancedFormType } from '@/lib/feedback-defaults'
import type { FeedbackRole, AdvancedFormType, QrPointFormType, QrPointKind } from '@/lib/feedback-defaults'

// Present when the scanned code is an event/place QR point rather than the
// school-wide QR (see GET /api/feedback/resolve).
export interface QrPointPublic {
  kind: QrPointKind
  title: string
  venue: string | null
  event_date: string | null // YYYY-MM-DD
  details: string | null
  form_type: QrPointFormType
  roles: FeedbackRole[]
  fixed_categories: boolean // true = skip the category picker, rate all returned categories
}

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
  emoji: string
  options?: string[]
  // Shown on the option chips only — stored values stay the plain option text.
  optionEmojis?: Record<string, string>
  placeholder?: string
  required?: boolean
  // textarea: one-tap starter phrases
  suggestions?: string[]
  // date: which quick-pick chips to offer (future = Today/Tomorrow/…, past = Today/Yesterday/…)
  dateHint?: 'future' | 'past'
  // select: lay all options out in one row (emoji scales like 😞 😐 😊 🤩)
  scale?: boolean
}

// Shared 4-point emoji scale for "how useful / how was it" questions
const USEFUL_SCALE = {
  options: ['Not useful', 'Okay', 'Useful', 'Very useful'],
  optionEmojis: { 'Not useful': '😞', Okay: '😐', Useful: '😊', 'Very useful': '🤩' },
  scale: true,
}

export const ADVANCED_FORM_FIELDS: Record<AdvancedFormType, AdvancedFormField[]> = {
  meeting: [
    { key: 'reason', label: 'What would you like to discuss?', emoji: '💬', type: 'textarea', required: true, placeholder: "e.g. My child's progress in Math",
      suggestions: ["My child's progress", 'Behaviour / discipline', 'Fees or admin query', 'Health or wellbeing'] },
    { key: 'with', label: 'Who would you like to meet?', emoji: '🤝', type: 'select', required: true,
      options: ['Class Teacher', 'Subject Teacher', 'Principal', 'Admin Office'],
      optionEmojis: { 'Class Teacher': '👩‍🏫', 'Subject Teacher': '📘', Principal: '🎓', 'Admin Office': '🏢' } },
    { key: 'preferred_date', label: 'Preferred date', emoji: '📅', type: 'date', dateHint: 'future' },
    { key: 'preferred_time', label: 'Preferred time', emoji: '⏰', type: 'select',
      options: ['Morning', 'Afternoon', 'Evening'],
      optionEmojis: { Morning: '🌅', Afternoon: '☀️', Evening: '🌇' } },
    { key: 'urgency', label: 'How urgent is it?', emoji: '⚡', type: 'select',
      options: ['Normal', 'Urgent'],
      optionEmojis: { Normal: '🙂', Urgent: '🚨' } },
  ],
  event: [
    { key: 'event_name', label: 'Which event?', emoji: '🎉', type: 'text', required: true, placeholder: 'e.g. Annual Sports Day' },
    { key: 'event_date', label: 'When was it?', emoji: '📅', type: 'date', dateHint: 'past' },
    { key: 'feedback_type', label: 'What kind of feedback?', emoji: '🏷️', type: 'select', required: true,
      options: ['Appreciation', 'Suggestion', 'Complaint'],
      optionEmojis: { Appreciation: '👏', Suggestion: '💡', Complaint: '😟' } },
    { key: 'details', label: 'Tell us more', emoji: '✍️', type: 'textarea', required: true, placeholder: 'What stood out? What could be better?',
      suggestions: ['Loved the performances', 'Seating was a problem', 'Food & water arrangements', 'Timing / delays'] },
  ],
  exam: [
    { key: 'exam_name', label: 'Which exam / subject?', emoji: '📝', type: 'text', required: true, placeholder: 'e.g. Mid-term Science' },
    { key: 'exam_date', label: 'Exam date', emoji: '📅', type: 'date', dateHint: 'past' },
    { key: 'concern_type', label: 'What is the concern?', emoji: '❓', type: 'select', required: true,
      options: ['Schedule Clash', 'Paper Issue', 'Result Query', 'Invigilation', 'Other'],
      optionEmojis: { 'Schedule Clash': '🗓️', 'Paper Issue': '📄', 'Result Query': '📊', Invigilation: '👀', Other: '💭' } },
    { key: 'details', label: 'Tell us more', emoji: '✍️', type: 'textarea', required: true, placeholder: 'Describe the issue so we can look into it' },
  ],
  ptm: [
    { key: 'child_class', label: "Your child's class", emoji: '🏫', type: 'text', placeholder: 'e.g. Grade 5 A' },
    { key: 'meeting_date', label: 'PTM date', emoji: '📅', type: 'date', dateHint: 'past' },
    { key: 'met_with', label: 'Who did you meet?', emoji: '🤝', type: 'select',
      options: ['Class Teacher', 'Subject Teachers', 'Principal', 'Counsellor'],
      optionEmojis: { 'Class Teacher': '👩‍🏫', 'Subject Teachers': '📘', Principal: '🎓', Counsellor: '💚' } },
    { key: 'usefulness', label: 'How useful was the meeting?', emoji: '⭐', type: 'select', required: true, ...USEFUL_SCALE },
    { key: 'waiting_time', label: 'How long did you wait?', emoji: '⏳', type: 'select',
      options: ['Under 10 min', '10–30 min', 'Over 30 min'],
      optionEmojis: { 'Under 10 min': '⚡', '10–30 min': '⏳', 'Over 30 min': '🐢' } },
    { key: 'concerns_addressed', label: 'Were your concerns addressed?', emoji: '✅', type: 'select', required: true,
      options: ['Yes', 'Partly', 'No'],
      optionEmojis: { Yes: '✅', Partly: '🤏', No: '❌' } },
    { key: 'comments', label: 'Anything else?', emoji: '✍️', type: 'textarea', placeholder: 'What went well, what could be better?',
      suggestions: ['Teacher was very helpful', 'Need a follow-up meeting', 'Waiting area was crowded', 'Would like more time'] },
  ],
  staff_meeting: [
    { key: 'topic', label: 'Meeting topic', emoji: '📋', type: 'text', required: true, placeholder: 'e.g. Term 2 planning' },
    { key: 'meeting_date', label: 'Meeting date', emoji: '📅', type: 'date', dateHint: 'past' },
    { key: 'usefulness', label: 'How useful was it?', emoji: '⭐', type: 'select', required: true, ...USEFUL_SCALE },
    { key: 'time_use', label: 'How was the length?', emoji: '⏱️', type: 'select',
      options: ['Too short', 'Just right', 'Too long'],
      optionEmojis: { 'Too short': '🏃', 'Just right': '👌', 'Too long': '😴' } },
    { key: 'clarity', label: 'Are the next steps clear?', emoji: '🎯', type: 'select', required: true,
      options: ['Clear', 'Somewhat', 'Unclear'],
      optionEmojis: { Clear: '🎯', Somewhat: '🤔', Unclear: '😵' } },
    { key: 'voice_heard', label: 'Did you get a chance to speak?', emoji: '🙋', type: 'select',
      options: ['Yes', 'A little', 'No'],
      optionEmojis: { Yes: '🙋', 'A little': '🤏', No: '🤐' } },
    { key: 'suggestions', label: 'Suggestions for next time', emoji: '💡', type: 'textarea', placeholder: 'How can we make staff meetings better?',
      suggestions: ['Share the agenda earlier', 'Keep it shorter', 'More time for questions', 'Send minutes after'] },
  ],
  academic: [
    { key: 'subject', label: 'Subject', emoji: '📚', type: 'text', placeholder: 'e.g. Mathematics' },
    { key: 'grade_class', label: 'Grade / Class', emoji: '🏫', type: 'text', placeholder: 'e.g. Grade 7 B' },
    { key: 'concern_type', label: 'What is it about?', emoji: '❓', type: 'select', required: true,
      options: ['Curriculum Pace', 'Homework Load', 'Teaching Quality', 'Resources', 'Other'],
      optionEmojis: { 'Curriculum Pace': '🏃', 'Homework Load': '🎒', 'Teaching Quality': '👩‍🏫', Resources: '🧰', Other: '💭' } },
    { key: 'details', label: 'Tell us more', emoji: '✍️', type: 'textarea', required: true, placeholder: 'Share your concern or suggestion' },
  ],
}
