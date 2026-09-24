import { GraduationCap, Handshake, FolderKanban, Presentation, Users } from 'lucide-react'
import { TEAL, GOLD, CORAL, GREEN, PURPLE } from '@/app/components/ulearn/theme'
import { FeedbackRole } from './types'

// Single source for each role's icon/color/blurb — used by the welcome
// role-picker and the category screen's header badge so they stay visually
// linked (same icon, same color) rather than each screen re-deciding.
export const ROLE_VISUAL: Record<FeedbackRole, { Icon: typeof Users; color: string; blurb: string }> = {
  parent:  { Icon: Users,          color: CORAL,  blurb: 'For parents and guardians' },
  student: { Icon: GraduationCap,  color: GREEN,  blurb: 'For current students' },
  teacher: { Icon: Presentation,   color: GOLD,   blurb: 'For teaching and support staff' },
  visitor: { Icon: Handshake,      color: TEAL,   blurb: 'Visiting the campus today' },
  other:   { Icon: FolderKanban,   color: PURPLE, blurb: 'Meeting, event, exam or academic requests' },
}
