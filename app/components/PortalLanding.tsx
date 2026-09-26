'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import {
  ArrowRight, BarChart3, Bell, BookOpen, Building2, CalendarCheck, ClipboardCheck, IndianRupee,
  ListChecks, LockKeyhole, Moon, PenLine, Presentation, Sun, Sunrise, TrendingUp, Trophy, Users, UsersRound, Wallet,
} from 'lucide-react'
import SchoolScene, { type DayPart } from './SchoolScene'

type PortalId = 'student' | 'teacher' | 'parent' | 'admin'
type Icon = typeof BookOpen

const portals: Array<{ id: PortalId; testId: string; title: string; description: string; href: string; icon: Icon; features: Array<[string, Icon]> }> = [
  { id: 'student', testId: 'student', title: 'Student', description: 'Your lessons, attendance and results', href: '/student/login', icon: BookOpen, features: [['Lessons', BookOpen], ['Attendance', CalendarCheck], ['Achievements', Trophy]] },
  { id: 'teacher', testId: 'teacher', title: 'Teacher', description: 'Your classes and teaching day', href: '/teacher/login', icon: Presentation, features: [['Attendance', ClipboardCheck], ['Marks', PenLine], ['Syllabus', ListChecks]] },
  { id: 'parent', testId: 'parent', title: 'Parent', description: "Stay close to your child's school day", href: '/parent/login', icon: UsersRound, features: [['Progress', TrendingUp], ['Notices', Bell], ['Fees', Wallet]] },
  { id: 'admin', testId: 'school-admin', title: 'School', description: 'Run your whole school in one place', href: '/login?role=school', icon: Building2, features: [['People', Users], ['Fees', IndianRupee], ['Reports', BarChart3]] },
]

const LAST_PORTAL_KEY = 'wlyl:last-portal'
const noopSubscribe = () => () => {}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function readLastPortal(): PortalId | null {
  try {
    const stored = localStorage.getItem(LAST_PORTAL_KEY)
    return portals.some(p => p.id === stored) ? (stored as PortalId) : null
  } catch {
    return null
  }
}

function readDayPart(): DayPart {
  const hour = new Date().getHours()
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

const greetingIcon = { morning: Sunrise, afternoon: Sun, evening: Moon }

export default function PortalLanding() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const lastPortal = useSyncExternalStore(subscribeToStorage, readLastPortal, () => null)
  const dayPart = useSyncExternalStore(noopSubscribe, readDayPart, () => null)
  const [active, setActive] = useState<PortalId | null>(null)
  const [transitioning, setTransitioning] = useState<PortalId | null>(null)
  const [origin, setOrigin] = useState({ x: '50%', y: '50%' })

  const openPortal = useCallback((id: PortalId, href: string, point?: { x: number; y: number }) => {
    try { localStorage.setItem(LAST_PORTAL_KEY, id) } catch {}
    if (reduceMotion) { router.push(href); return }
    setOrigin(point ? { x: `${point.x}px`, y: `${point.y}px` } : { x: '50%', y: '50%' })
    setTransitioning(id)
    window.setTimeout(() => router.push(href), 260)
  }, [reduceMotion, router])

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: PortalId, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      try { localStorage.setItem(LAST_PORTAL_KEY, id) } catch {}
      return
    }
    event.preventDefault()
    openPortal(id, href, { x: event.clientX, y: event.clientY })
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const portal = portals[Number(event.key) - 1]
      if (portal) openPortal(portal.id, portal.href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPortal])

  function tilt(event: PointerEvent<HTMLAnchorElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return
    const el = event.currentTarget
    const r = el.getBoundingClientRect()
    const px = (event.clientX - r.left) / r.width
    const py = (event.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(px - 0.5) * 10}deg`)
    el.style.setProperty('--rx', `${(0.5 - py) * 10}deg`)
    el.style.setProperty('--gx', `${px * 100}%`)
    el.style.setProperty('--gy', `${py * 100}%`)
  }

  function resetTilt(event: PointerEvent<HTMLAnchorElement>) {
    const el = event.currentTarget
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
  }

  function parallax(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return
    const el = event.currentTarget
    el.style.setProperty('--mx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
    el.style.setProperty('--my', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
  }

  const GreetingIcon = dayPart ? greetingIcon[dayPart] : Sun

  return (
    <div
      onPointerMove={parallax}
      className="pl-shell"
      data-active={active ?? undefined}
      data-transitioning={transitioning ?? undefined}
      style={{ '--transition-x': origin.x, '--transition-y': origin.y } as CSSProperties}
    >
      <div className="pl-ambient" aria-hidden="true">
        <span className="pl-blob pl-blob-a" />
        <span className="pl-blob pl-blob-b" />
        <span className="pl-blob pl-blob-c" />
        <span className="pl-blob pl-blob-focus" />
      </div>

      <header className="pl-header">
        <Link href="/" className="pl-brand" aria-label="WeLearnYouLearn home"><span>W</span><b>WeLearnYouLearn</b></Link>
        <p className="pl-secure"><LockKeyhole aria-hidden="true" /> Secure school access</p>
      </header>

      <main className="pl-main">
        <section className="pl-hero">
          <motion.div
            className="pl-intro"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="pl-greeting" data-part={dayPart ?? undefined}>
              <GreetingIcon aria-hidden="true" />
              {dayPart ? `Good ${dayPart}` : 'Welcome'}
            </p>
            <h1>Where would you like <em>to go today?</em></h1>
            <p>Choose your portal and sign in with the account your school gave you.</p>
          </motion.div>

          <motion.div
            className="pl-scene-wrap"
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <SchoolScene dayPart={dayPart} />
          </motion.div>
        </section>

        <nav className="pl-grid" aria-label="School portals" onMouseLeave={() => setActive(null)}>
          {portals.map((portal, index) => (
            <motion.div
              key={portal.id}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href={portal.href}
                className="pl-card"
                data-portal={portal.id}
                data-testid={`portal-card-${portal.testId}`}
                aria-keyshortcuts={String(index + 1)}
                onClick={event => handleClick(event, portal.id, portal.href)}
                onPointerEnter={() => setActive(portal.id)}
                onPointerMove={tilt}
                onPointerLeave={resetTilt}
                onFocus={() => setActive(portal.id)}
                onBlur={() => setActive(null)}
              >
                {lastPortal === portal.id && <span className="pl-last">Last used</span>}
                <span className="pl-card-icon" aria-hidden="true"><portal.icon /></span>
                <span className="pl-card-text">
                  <strong>{portal.title}</strong>
                  <span>{portal.description}</span>
                </span>
                <span className="pl-chips" aria-hidden="true">
                  {portal.features.map(([label, FeatureIcon], i) => (
                    <span key={label} className="pl-chip" style={{ '--i': i } as CSSProperties}><FeatureIcon />{label}</span>
                  ))}
                </span>
                <span className="pl-card-go">
                  Sign in <ArrowRight aria-hidden="true" />
                  <kbd className="pl-kbd" aria-hidden="true">{index + 1}</kbd>
                </span>
              </Link>
            </motion.div>
          ))}
        </nav>

        <p className="pl-help">
          <span className="pl-help-keys">Tip: press <kbd>1</kbd>–<kbd>4</kbd> to jump straight in. </span>
          No account yet? Your school office can set one up for you.
        </p>
      </main>

      <footer className="pl-footer">
        <span>© {new Date().getFullYear()} WeLearnYouLearn</span>
        <Link href="/admin">Platform administration</Link>
      </footer>

      <div className="pl-wash" aria-hidden="true" />
    </div>
  )
}
