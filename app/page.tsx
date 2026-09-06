import Link from 'next/link'
import Image from 'next/image'
import { Fraunces, Inter } from 'next/font/google'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display' })
const inter = Inter({ subsets: ['latin'], variable: '--font-body' })

const roles = [
  {
    title: 'School Admin',
    description: 'Manage classes, teachers, fees, attendance & operations',
    href: '/login?role=school',
    testid: 'school-admin',
    photo: 'https://images.unsplash.com/photo-1592066575517-58df903152f2?w=800&auto=format&fit=crop&q=70',
    alt: 'School building exterior',
    tape: '-rotate-2',
    pin: 'bg-indigo-500',
    caption: 'Front office, 8:15am',
  },
  {
    title: 'Teacher',
    description: 'Mark attendance, assign homework, answer student doubts',
    href: '/teacher/login',
    testid: 'teacher',
    photo: 'https://images.unsplash.com/photo-1589206946274-929e4da3996b?w=800&auto=format&fit=crop&q=70',
    alt: 'Teacher pointing at a workbook with a student',
    tape: 'rotate-1',
    pin: 'bg-emerald-600',
    caption: 'Reading corner, Grade 4',
  },
  {
    title: 'Student',
    description: 'View timetable, submit homework, check marks & doubts',
    href: '/student/login',
    testid: 'student',
    photo: 'https://images.unsplash.com/photo-1581726690015-c9861fa5057f?w=800&auto=format&fit=crop&q=70',
    alt: 'Student raising her hand in class',
    tape: '-rotate-1',
    pin: 'bg-amber-500',
    caption: 'Question time, Room 12',
  },
  {
    title: 'Parent',
    description: 'Track attendance, fees, exam results & school updates',
    href: '/parent/login',
    testid: 'parent',
    photo: 'https://images.unsplash.com/photo-1516901408257-500ed7566e6a?w=800&auto=format&fit=crop&q=70',
    alt: 'Parent holding their child\'s hand while walking',
    tape: 'rotate-2',
    pin: 'bg-rose-500',
    caption: 'Pickup line, 3:30pm',
  },
]

const stats = [
  { value: '100%', label: 'digital, no paper trail' },
  { value: '4', label: 'portals, one login page' },
  { value: '5 min', label: 'to onboard a new class' },
]

export default function Home() {
  return (
    <div className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#faf6ef] text-stone-900`} style={{ fontFamily: 'var(--font-body)' }}>

      {/* faint paper grain */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035] mix-blend-multiply"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full border-2 border-stone-900 flex items-center justify-center">
            <span className="font-black text-xs" style={{ fontFamily: 'var(--font-display)' }}>W</span>
          </div>
          <span className="font-semibold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>WeLearnYouLearn</span>
        </div>
        <span className="hidden sm:inline text-[11px] uppercase tracking-[0.15em] text-stone-500 border border-stone-300 px-3 py-1.5 rounded-full">
          A School Management Platform
        </span>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 sm:px-12 pt-8 sm:pt-14 pb-20">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-8 items-center">

          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 mb-5">
              <svg width="26" height="26" viewBox="0 0 26 26" className="text-amber-500 -rotate-6">
                <path d="M13 2 L15.5 10 L23 13 L15.5 16 L13 24 L10.5 16 L3 13 L10.5 10 Z" fill="currentColor" />
              </svg>
              <span className="text-sm text-stone-500 italic" style={{ fontFamily: 'var(--font-display)' }}>
                for schools who&apos;d rather teach than file paperwork
              </span>
            </div>

            <h1 className="text-[2.75rem] sm:text-6xl leading-[1.05] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              One school,
              <br />
              <span className="italic font-normal">four</span> logins that
              <br />
              actually talk to each other.
            </h1>

            {/* Mobile-only photo, standing in for the desktop collage */}
            <div className="relative lg:hidden w-48 mx-0 my-6 rotate-2 bg-white p-2 pb-6 shadow-xl rounded-sm">
              <div className="relative w-full h-40 overflow-hidden">
                <Image src="https://images.unsplash.com/photo-1581726690015-c9861fa5057f?w=600&auto=format&fit=crop&q=70" alt="Student raising her hand in class" fill sizes="192px" className="object-cover grayscale-[15%]" priority />
              </div>
              <p className="absolute bottom-1.5 left-3 right-3 text-[10px] text-stone-500 italic" style={{ fontFamily: 'var(--font-display)' }}>
                &quot;Question time, Room 12&quot;
              </p>
            </div>

            <p className="mt-6 text-stone-600 text-base sm:text-lg max-w-md leading-relaxed">
              Admins run the school, teachers run the classroom, students do the work,
              parents stay in the loop — all from the same place, without the usual
              spreadsheet-and-WhatsApp chaos.
            </p>

            {/* hand-drawn underline accent */}
            <svg width="140" height="12" viewBox="0 0 140 12" className="mt-3 text-amber-500">
              <path d="M2 8 C 30 2, 60 11, 90 5 S 130 3, 138 7" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>

            {/* Stats, as an index-card row */}
            <div className="grid grid-cols-3 gap-2.5 sm:flex sm:flex-wrap sm:gap-4 mt-10">
              {stats.map((s) => (
                <div key={s.label} className="bg-white border border-stone-200 rounded-lg px-3 py-3 sm:px-4 shadow-[2px_3px_0_0_rgba(28,25,23,0.08)]">
                  <p className="text-lg sm:text-xl font-semibold text-stone-900" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</p>
                  <p className="text-[10px] sm:text-[11px] text-stone-500 mt-0.5 sm:max-w-[9rem] leading-snug">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: photo collage */}
          <div className="relative h-[380px] sm:h-[440px] hidden lg:block">
            <div className="absolute top-0 right-4 w-64 rotate-3 bg-white p-2.5 pb-8 shadow-xl rounded-sm z-20">
              <div className="relative w-full h-64 overflow-hidden">
                <Image src="https://images.unsplash.com/photo-1581726690015-c9861fa5057f?w=700&auto=format&fit=crop&q=70" alt="Student raising her hand in class" fill sizes="260px" className="object-cover grayscale-[15%]" priority />
              </div>
              <p className="absolute bottom-2 left-3 right-3 text-[11px] text-stone-500 italic" style={{ fontFamily: 'var(--font-display)' }}>
                &quot;Question time, Room 12&quot;
              </p>
            </div>
            <div className="absolute bottom-0 left-0 w-52 -rotate-6 bg-white p-2.5 pb-7 shadow-xl rounded-sm">
              <div className="relative w-full h-48 overflow-hidden">
                <Image src="https://images.unsplash.com/photo-1516901408257-500ed7566e6a?w=700&auto=format&fit=crop&q=70" alt="Parent holding their child's hand while walking" fill sizes="210px" className="object-cover grayscale-[15%]" />
              </div>
              <p className="absolute bottom-1.5 left-3 right-3 text-[10px] text-stone-500 italic" style={{ fontFamily: 'var(--font-display)' }}>
                &quot;Pickup line, 3:30pm&quot;
              </p>
            </div>
            {/* washi tape */}
            <div className="absolute top-[-6px] right-20 w-14 h-6 bg-amber-300/70 rotate-3 shadow-sm z-10" />
            <div className="absolute top-[-6px] left-4 w-14 h-6 bg-rose-300/70 -rotate-6 shadow-sm z-10" />
          </div>
        </div>

        {/* Portal section */}
        <div className="mt-24 sm:mt-32">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              Pick your portal
            </h2>
            <span className="text-sm text-stone-500 italic" style={{ fontFamily: 'var(--font-display)' }}>
              same school, different view
            </span>
          </div>

          <div data-testid="portal-selection" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role) => (
              <Link
                key={role.href}
                href={role.href}
                data-testid={`portal-card-${role.testid}`}
                className="group relative flex flex-col bg-white border border-stone-200 rounded-xl overflow-hidden shadow-[3px_4px_0_0_rgba(28,25,23,0.06)] hover:shadow-[5px_6px_0_0_rgba(28,25,23,0.1)] hover:-translate-y-1 transition-all duration-300"
              >
                {/* pin */}
                <div className={`absolute top-3 left-3 w-3 h-3 rounded-full ${role.pin} ring-2 ring-white z-10 shadow`} />

                <div className={`relative w-full h-36 overflow-hidden ${role.tape}`}>
                  <Image
                    src={role.photo}
                    alt={role.alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover scale-110 group-hover:scale-100 transition-transform duration-500"
                  />
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 italic mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    {role.caption}
                  </p>
                  <h3 className="font-semibold text-stone-900 text-base" style={{ fontFamily: 'var(--font-display)' }}>
                    {role.title}
                  </h3>
                  <p className="text-stone-500 text-xs leading-relaxed mt-1 flex-1">{role.description}</p>

                  <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-900 mt-3 group-hover:gap-2 transition-all">
                    Enter
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-stone-400 text-xs">© 2025 WeLearnYouLearn — sketched, built and shipped for Indian schools.</p>
          <p className="text-stone-400 text-xs italic" style={{ fontFamily: 'var(--font-display)' }}>Made with chalk dust and coffee.</p>
        </div>
      </main>
    </div>
  )
}
