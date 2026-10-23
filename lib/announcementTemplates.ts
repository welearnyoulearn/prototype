// Ready-made announcement templates. A template pre-fills the composer and, for festive / greeting
// templates, decides how the notice LOOKS to teachers, students and parents (an animated card that
// opens when they tap the notice). Pure data — used by the composer, the live preview and the
// server (to validate template_key). No images to host: art is emoji + gradients + CSS motion.

export type TemplateCategory = 'festival' | 'holiday' | 'school'

// What floats across the card. GreetingCard maps each motif to a set of emoji and a movement.
export type Motif =
  | 'lamps' | 'confetti' | 'kites' | 'petals' | 'sparkles' | 'balloons'
  | 'snow' | 'tricolor' | 'crescent' | 'books' | 'alert' | 'sun' | 'stars' | 'colors'

export type AnnouncementTemplate = {
  key: string
  label: string
  category: TemplateCategory
  emoji: string                 // centrepiece
  motif: Motif
  gradient: [string, string, string]
  dark: boolean                 // true = white text on the gradient
  title: string                 // default notice title
  headline: string              // big text on the card
  message: string               // default body; {school} is replaced with the school name
  type: 'general' | 'circular' | 'event' | 'alert'
  priority: 'normal' | 'high' | 'urgent'
  greeting: boolean             // greeting cards pop up once for everyone who has not seen them
  requiresAck?: boolean
}

export const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  // ── Festivals ────────────────────────────────────────────────────────────
  { key: 'pongal', label: 'Pongal', category: 'festival', emoji: '🍯', motif: 'sun', gradient: ['#f59e0b', '#f97316', '#dc2626'], dark: true,
    title: 'Happy Pongal!', headline: 'Happy Pongal!', greeting: true, type: 'event', priority: 'normal',
    message: 'May the harvest festival fill your home with sweetness, prosperity and joy. Wishing every student, parent and teacher a very Happy Pongal!\n\n— {school}' },
  { key: 'sankranti', label: 'Makar Sankranti', category: 'festival', emoji: '🪁', motif: 'kites', gradient: ['#38bdf8', '#6366f1', '#a855f7'], dark: true,
    title: 'Happy Makar Sankranti!', headline: 'Happy Sankranti!', greeting: true, type: 'event', priority: 'normal',
    message: 'May your life soar high like a kite this Sankranti. Warm wishes to all our students, parents and staff.\n\n— {school}' },
  { key: 'ugadi', label: 'Ugadi', category: 'festival', emoji: '🌿', motif: 'petals', gradient: ['#16a34a', '#65a30d', '#facc15'], dark: true,
    title: 'Happy Ugadi!', headline: 'Happy Ugadi!', greeting: true, type: 'event', priority: 'normal',
    message: 'A new year, new hopes. May Ugadi bring you six flavours of happiness — sweet, sour and everything in between!\n\n— {school}' },
  { key: 'dasara', label: 'Dasara / Navratri', category: 'festival', emoji: '🏹', motif: 'sparkles', gradient: ['#b91c1c', '#ea580c', '#fbbf24'], dark: true,
    title: 'Happy Dasara!', headline: 'Happy Dasara!', greeting: true, type: 'event', priority: 'normal',
    message: 'May good triumph over evil and light every corner of your life. Wishing you a joyful and victorious Dasara.\n\n— {school}' },
  { key: 'diwali', label: 'Diwali', category: 'festival', emoji: '🪔', motif: 'lamps', gradient: ['#1e1b4b', '#7c2d12', '#f59e0b'], dark: true,
    title: 'Happy Diwali!', headline: 'Happy Diwali!', greeting: true, type: 'event', priority: 'normal',
    message: 'May the festival of lights brighten your life with happiness and success. Stay safe, celebrate responsibly — Happy Diwali!\n\n— {school}' },
  { key: 'holi', label: 'Holi', category: 'festival', emoji: '🎨', motif: 'colors', gradient: ['#ec4899', '#a855f7', '#22d3ee'], dark: true,
    title: 'Happy Holi!', headline: 'Happy Holi!', greeting: true, type: 'event', priority: 'normal',
    message: 'May your life be filled with the colours of joy, love and friendship. Happy Holi from all of us!\n\n— {school}' },
  { key: 'ganesh', label: 'Vinayaka Chavithi', category: 'festival', emoji: '🐘', motif: 'petals', gradient: ['#f97316', '#e11d48', '#7c3aed'], dark: true,
    title: 'Happy Vinayaka Chavithi!', headline: 'Ganpati Bappa Morya!', greeting: true, type: 'event', priority: 'normal',
    message: 'May Lord Ganesha remove every obstacle from your path and bless you with wisdom and success.\n\n— {school}' },
  { key: 'eid', label: 'Eid', category: 'festival', emoji: '🌙', motif: 'crescent', gradient: ['#064e3b', '#0f766e', '#a7f3d0'], dark: true,
    title: 'Eid Mubarak!', headline: 'Eid Mubarak!', greeting: true, type: 'event', priority: 'normal',
    message: 'Wishing you and your family peace, happiness and countless blessings on Eid. Eid Mubarak!\n\n— {school}' },
  { key: 'christmas', label: 'Christmas', category: 'festival', emoji: '🎄', motif: 'snow', gradient: ['#14532d', '#166534', '#b91c1c'], dark: true,
    title: 'Merry Christmas!', headline: 'Merry Christmas!', greeting: true, type: 'event', priority: 'normal',
    message: 'Wishing you a season of joy, love and togetherness. Merry Christmas and a Happy New Year!\n\n— {school}' },
  { key: 'new-year', label: 'New Year', category: 'festival', emoji: '🎆', motif: 'stars', gradient: ['#0f172a', '#4338ca', '#db2777'], dark: true,
    title: 'Happy New Year!', headline: 'Happy New Year!', greeting: true, type: 'event', priority: 'normal',
    message: 'Here is to a year of learning, laughter and new achievements. Happy New Year to our whole school family!\n\n— {school}' },
  { key: 'republic-day', label: 'Republic Day', category: 'festival', emoji: '🇮🇳', motif: 'tricolor', gradient: ['#f97316', '#f8fafc', '#16a34a'], dark: false,
    title: 'Happy Republic Day!', headline: 'Happy Republic Day!', greeting: true, type: 'event', priority: 'normal',
    message: 'Let us honour the Constitution and the values it stands for. Jai Hind!\n\n— {school}' },
  { key: 'independence-day', label: 'Independence Day', category: 'festival', emoji: '🇮🇳', motif: 'tricolor', gradient: ['#f97316', '#f8fafc', '#16a34a'], dark: false,
    title: 'Happy Independence Day!', headline: 'Happy Independence Day!', greeting: true, type: 'event', priority: 'normal',
    message: 'Freedom is a responsibility we carry proudly. Wishing you a very Happy Independence Day. Jai Hind!\n\n— {school}' },
  { key: 'teachers-day', label: "Teachers' Day", category: 'festival', emoji: '📚', motif: 'books', gradient: ['#1d4ed8', '#4f46e5', '#0ea5e9'], dark: true,
    title: "Happy Teachers' Day!", headline: "Happy Teachers' Day!", greeting: true, type: 'event', priority: 'normal',
    message: 'To every teacher who shapes minds and lights the way — thank you for everything you do.\n\n— {school}' },
  { key: 'childrens-day', label: "Children's Day", category: 'festival', emoji: '🎈', motif: 'balloons', gradient: ['#f472b6', '#fb923c', '#facc15'], dark: true,
    title: "Happy Children's Day!", headline: "Happy Children's Day!", greeting: true, type: 'event', priority: 'normal',
    message: 'Keep dreaming, keep learning, keep smiling! Happy Children\'s Day to all our wonderful students.\n\n— {school}' },

  // ── Holidays & closures ──────────────────────────────────────────────────
  { key: 'holiday', label: 'Holiday notice', category: 'holiday', emoji: '🏖️', motif: 'sun', gradient: ['#0ea5e9', '#06b6d4', '#34d399'], dark: true,
    title: 'School holiday', headline: 'School will remain closed', greeting: false, type: 'circular', priority: 'high',
    message: 'The school will remain closed on [date] on account of [reason].\n\nClasses will resume on [date]. Enjoy the break!\n\n— {school}' },
  { key: 'summer-vacation', label: 'Vacation', category: 'holiday', emoji: '🌴', motif: 'sun', gradient: ['#f59e0b', '#fb7185', '#8b5cf6'], dark: true,
    title: 'Vacation announcement', headline: 'Happy Vacation!', greeting: true, type: 'circular', priority: 'high',
    message: 'The school will remain closed from [start date] to [end date] for the vacation. School reopens on [date].\n\n— {school}' },
  { key: 'emergency-closure', label: 'Emergency closure', category: 'holiday', emoji: '🚨', motif: 'alert', gradient: ['#7f1d1d', '#dc2626', '#f97316'], dark: true,
    title: 'URGENT: School closed today', headline: 'School closed today', greeting: false, type: 'alert', priority: 'urgent',
    message: 'Due to [reason], the school is closed today. Please do not send your child to school. We will inform you when classes resume.\n\n— {school}', requiresAck: true },

  // ── School life ──────────────────────────────────────────────────────────
  { key: 'welcome-back', label: 'Welcome back', category: 'school', emoji: '🎒', motif: 'confetti', gradient: ['#6366f1', '#8b5cf6', '#ec4899'], dark: true,
    title: 'Welcome back!', headline: 'Welcome back!', greeting: true, type: 'general', priority: 'normal',
    message: 'A new academic year is here. We are excited to see every student back and ready to learn!\n\n— {school}' },
  { key: 'ptm', label: 'Parent–Teacher Meeting', category: 'school', emoji: '🤝', motif: 'stars', gradient: ['#0f766e', '#0ea5e9', '#6366f1'], dark: true,
    title: 'Parent–Teacher Meeting', headline: 'Parent–Teacher Meeting', greeting: false, type: 'event', priority: 'high', requiresAck: true,
    message: 'A Parent–Teacher Meeting is scheduled on [date] from [time] to [time].\n\nYour presence is important. Please tap "I have read this" to confirm.\n\n— {school}' },
  { key: 'exam-schedule', label: 'Exam schedule', category: 'school', emoji: '📝', motif: 'books', gradient: ['#1e3a8a', '#3b82f6', '#22d3ee'], dark: true,
    title: 'Exam schedule', headline: 'Exams are coming', greeting: false, type: 'circular', priority: 'high',
    message: 'The [exam name] will begin on [date]. The full timetable is available under Exam Schedule.\n\nBest wishes to all our students!\n\n— {school}' },
  { key: 'result-day', label: 'Results', category: 'school', emoji: '🏆', motif: 'confetti', gradient: ['#ca8a04', '#f59e0b', '#ef4444'], dark: true,
    title: 'Results announced', headline: 'Results are out!', greeting: true, type: 'event', priority: 'normal',
    message: 'The results for [exam name] are now available. Well done to everyone for the effort!\n\n— {school}' },
  { key: 'fee-reminder', label: 'Fee reminder', category: 'school', emoji: '💳', motif: 'stars', gradient: ['#475569', '#334155', '#0ea5e9'], dark: true,
    title: 'Fee payment reminder', headline: 'Fee payment reminder', greeting: false, type: 'circular', priority: 'high', requiresAck: true,
    message: 'This is a reminder that the [term] fee is due by [date]. Please pay on time to avoid late charges.\n\n— {school}' },
  { key: 'sports-day', label: 'Sports Day', category: 'school', emoji: '🏅', motif: 'confetti', gradient: ['#16a34a', '#0ea5e9', '#f59e0b'], dark: true,
    title: 'Annual Sports Day', headline: 'Sports Day!', greeting: false, type: 'event', priority: 'normal',
    message: 'Our Annual Sports Day is on [date] at [venue]. Come and cheer for your champions!\n\n— {school}' },
  { key: 'annual-day', label: 'Annual Day', category: 'school', emoji: '🎭', motif: 'sparkles', gradient: ['#7e22ce', '#db2777', '#f59e0b'], dark: true,
    title: 'Annual Day', headline: 'Annual Day', greeting: false, type: 'event', priority: 'normal',
    message: 'You are warmly invited to our Annual Day celebrations on [date] at [time].\n\n— {school}' },
]

export const TEMPLATE_KEYS = ANNOUNCEMENT_TEMPLATES.map(t => t.key)

export function getTemplate(key: string | null | undefined): AnnouncementTemplate | undefined {
  return key ? ANNOUNCEMENT_TEMPLATES.find(t => t.key === key) : undefined
}

// {school} → the school's name (done once, when the template is chosen in the composer)
export function fillTemplate(text: string, schoolName: string): string {
  return text.replace(/\{school\}/g, schoolName || 'Your School')
}

// What a "card" announcement stores in announcements.card_data
export type CardData = { headline: string }
