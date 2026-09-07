export type FeedbackRole = 'parent' | 'student' | 'teacher' | 'visitor' | 'other'

export interface FeedbackCategory {
  id: number
  role: FeedbackRole
  key: string
  label: string
  icon: string | null
  department: string | null
}

export type WizardStep = 'welcome' | 'identity' | 'categories' | 'rating' | 'followup' | 'thankyou'

export const QUICK_PICKS = ['Great experience', 'Needs improvement', 'Urgent concern', 'Just a suggestion'] as const
