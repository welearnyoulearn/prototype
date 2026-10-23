import { CalendarClock, FileText, GraduationCap, PartyPopper, Presentation, Users } from 'lucide-react'
import { TEAL, GOLD, CORAL, PURPLE, GREEN } from '@/app/components/ulearn/theme'
import { AdvancedFormType } from './types'

export const ADVANCED_TYPE_VISUAL: Record<AdvancedFormType, { Icon: typeof CalendarClock; color: string }> = {
  meeting:  { Icon: CalendarClock, color: TEAL },
  event:    { Icon: PartyPopper,   color: CORAL },
  exam:     { Icon: FileText,      color: PURPLE },
  academic: { Icon: GraduationCap, color: GOLD },
  ptm:      { Icon: Users,         color: CORAL },
  staff_meeting: { Icon: Presentation, color: GREEN },
}
