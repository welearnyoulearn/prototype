import Link from 'next/link'

const roles = [
  {
    title: 'School Admin',
    description: 'Manage classes, teachers, fees, attendance & operations',
    href: '/login?role=school',
    gradient: 'from-blue-600 to-indigo-600',
    shadow: 'shadow-blue-500/30',
    glow: 'group-hover:shadow-blue-500/40',
    emoji: '🏫',
    badge: 'Admin Portal',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    title: 'Teacher',
    description: 'Mark attendance, assign homework, answer student doubts',
    href: '/teacher/login',
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/30',
    glow: 'group-hover:shadow-emerald-500/40',
    emoji: '👨‍🏫',
    badge: 'Teacher Portal',
    badgeColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    title: 'Student',
    description: 'View timetable, submit homework, check marks & doubts',
    href: '/student/login',
    gradient: 'from-orange-500 to-amber-500',
    shadow: 'shadow-orange-500/30',
    glow: 'group-hover:shadow-orange-500/40',
    emoji: '🎓',
    badge: 'Student Portal',
    badgeColor: 'bg-orange-100 text-orange-700',
  },
  {
    title: 'Parent',
    description: 'Track attendance, fees, exam results & school updates',
    href: '/parent/login',
    gradient: 'from-purple-500 to-pink-500',
    shadow: 'shadow-purple-500/30',
    glow: 'group-hover:shadow-purple-500/40',
    emoji: '👨‍👩‍👧',
    badge: 'Parent Portal',
    badgeColor: 'bg-purple-100 text-purple-700',
  },
]

const stats = [
  { value: '100%', label: 'Digital School' },
  { value: '4', label: 'Portals' },
  { value: '∞', label: 'Possibilities' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-hidden relative">

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-teal-600/15 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white font-black text-sm">W</span>
            </div>
            <span className="font-bold text-lg tracking-tight">WeLearnYouLearn</span>
          </div>
          <span className="text-xs text-white/40 border border-white/10 px-3 py-1 rounded-full">
            School Management Platform
          </span>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
          <div className="w-full max-w-3xl mx-auto">

            {/* Badge */}
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white/70 text-xs font-medium px-4 py-1.5 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Now Live — Powering Schools Across India
              </span>
            </div>

            {/* Title */}
            <div className="text-center mb-4">
              <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
                Smart School
                <span className="block bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Management
                </span>
              </h1>
              <p className="mt-4 text-white/50 text-base sm:text-lg max-w-md mx-auto leading-relaxed">
                One platform for admins, teachers, students and parents.
                Simple. Fast. Reliable.
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-center gap-8 sm:gap-12 mb-10 mt-6">
              {stats.map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-black text-white">{s.value}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Role cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {roles.map((role) => (
                <Link
                  key={role.href}
                  href={role.href}
                  className={`group relative flex items-center gap-4 p-5 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 shadow-lg ${role.shadow} hover:shadow-xl ${role.glow} hover:-translate-y-0.5`}
                >
                  {/* Gradient accent line */}
                  <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gradient-to-b ${role.gradient} opacity-80`} />

                  {/* Icon */}
                  <div className={`ml-3 w-12 h-12 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-2xl flex-shrink-0 shadow-lg`}>
                    {role.emoji}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-white text-base">{role.title}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${role.badgeColor} hidden sm:inline`}>
                        {role.badge}
                      </span>
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed">{role.description}</p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>

            {/* Footer note */}
            <p className="text-center text-white/25 text-xs mt-8">
              © 2025 WeLearnYouLearn · Built for Indian Schools
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
