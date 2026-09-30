'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type MouseEvent, type PointerEvent,
} from 'react'
import {
  ArrowRight, BarChart3, Bell, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck,
  IndianRupee, ListChecks, LockKeyhole, Moon, PenLine, Sun, Sunrise, TrendingUp, Trophy, Users, Wallet,
} from 'lucide-react'
import { ParentIcon, SchoolIcon, StudentIcon, TeacherIcon } from './PortalIcons'

type PortalId = 'student' | 'teacher' | 'parent' | 'admin'
type DayPart = 'morning' | 'afternoon' | 'evening'
type Icon = typeof BookOpen | typeof StudentIcon

const portals: Array<{
  id: PortalId; testId: string; title: string; verb: string; description: string; href: string; icon: Icon; features: Array<[string, Icon]>; art: [string, string]
}> = [
  { id: 'student', testId: 'student', title: 'Student', verb: 'learn.', description: 'Your lessons, attendance, results and every win along the way.', href: '/student/login', icon: StudentIcon, art: ['/landing/student-3d.png', '/student-icons/books.png'], features: [['Lessons', BookOpen], ['Attendance', CalendarCheck], ['Achievements', Trophy]] },
  { id: 'teacher', testId: 'teacher', title: 'Teacher', verb: 'teach.', description: 'Your classes, attendance, marks and syllabus, all in one calm place.', href: '/teacher/login', icon: TeacherIcon, art: ['/landing/teacher-3d.png', '/student-icons/light-bulb.png'], features: [['Attendance', ClipboardCheck], ['Marks', PenLine], ['Syllabus', ListChecks]] },
  { id: 'parent', testId: 'parent', title: 'Parent', verb: 'stay close.', description: "Your child's progress, school notices and fees, always within reach.", href: '/parent/login', icon: ParentIcon, art: ['/landing/parent-3d.png', '/landing/heart-3d.png'], features: [['Progress', TrendingUp], ['Notices', Bell], ['Fees', Wallet]] },
  { id: 'admin', testId: 'school-admin', title: 'School', verb: 'lead.', description: 'Staff, students, fees and the everyday running of your school.', href: '/login?role=school', icon: SchoolIcon, art: ['/landing/school-3d.png', '/student-icons/trophy.png'], features: [['People', Users], ['Fees', IndianRupee], ['Reports', BarChart3]] },
]

const COUNT = portals.length
const LAST_PORTAL_KEY = 'wlyl:last-portal'
const AUTO_TURN_MS = 3800
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
const mod = (n: number) => ((n % COUNT) + COUNT) % COUNT

export default function PortalLanding() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const lastPortal = useSyncExternalStore(subscribeToStorage, readLastPortal, () => null)
  const dayPart = useSyncExternalStore(noopSubscribe, readDayPart, () => null)
  const [turn, setTurn] = useState(0)
  const [interacted, setInteracted] = useState(false)
  const [transitioning, setTransitioning] = useState<PortalId | null>(null)
  const [origin, setOrigin] = useState({ x: '50%', y: '50%' })
  const swipeStart = useRef<number | null>(null)
  const swiped = useRef(false)

  const active = mod(turn)
  const current = portals[active]

  const select = useCallback((index: number) => {
    setInteracted(true)
    setTurn(t => {
      let delta = index - mod(t)
      if (delta > COUNT / 2) delta -= COUNT
      if (delta < -COUNT / 2) delta += COUNT
      return t + delta
    })
  }, [])

  const step = useCallback((direction: 1 | -1) => {
    setInteracted(true)
    setTurn(t => t + direction)
  }, [])

  const openPortal = useCallback((id: PortalId, href: string, point?: { x: number; y: number }) => {
    try { localStorage.setItem(LAST_PORTAL_KEY, id) } catch {}
    if (reduceMotion) { router.push(href); return }
    setOrigin(point ? { x: `${point.x}px`, y: `${point.y}px` } : { x: '50%', y: '50%' })
    setTransitioning(id)
    window.setTimeout(() => router.push(href), 260)
  }, [reduceMotion, router])

  function enter(event: MouseEvent<HTMLAnchorElement>, id: PortalId, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      try { localStorage.setItem(LAST_PORTAL_KEY, id) } catch {}
      return
    }
    event.preventDefault()
    openPortal(id, href, { x: event.clientX, y: event.clientY })
  }

  // Gently turns on its own so first-time visitors see every portal, and
  // stops for good the moment someone interacts.
  useEffect(() => {
    if (interacted || reduceMotion) return
    const id = window.setInterval(() => setTurn(t => t + 1), AUTO_TURN_MS)
    return () => window.clearInterval(id)
  }, [interacted, reduceMotion])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); return }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); return }
      const portal = portals[Number(event.key) - 1]
      if (portal) openPortal(portal.id, portal.href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPortal, step])

  function parallax(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return
    const el = event.currentTarget
    el.style.setProperty('--mx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
    el.style.setProperty('--my', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
  }

  function onSwipeStart(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    swipeStart.current = event.clientX
  }

  function onSwipeEnd(event: PointerEvent<HTMLDivElement>) {
    if (swipeStart.current === null) return
    const dx = event.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(dx) < 40) return
    swiped.current = true
    step(dx < 0 ? 1 : -1)
  }

  function onSlideClick(event: MouseEvent<HTMLAnchorElement>, index: number) {
    if (swiped.current) { swiped.current = false; event.preventDefault(); return }
    if (index !== active) { event.preventDefault(); select(index); return }
    enter(event, portals[index].id, portals[index].href)
  }

  const GreetingIcon = dayPart ? greetingIcon[dayPart] : Sun

  return (
    <div
      className="pl-shell"
      onPointerMove={parallax}
      data-active={current.id}
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
        <motion.div
          className="pl-intro"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="pl-greeting" data-part={dayPart ?? undefined}>
            <GreetingIcon aria-hidden="true" />
            {dayPart ? `Good ${dayPart}` : 'Welcome'}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pl-wave" src="/student-icons/waving-hand.png" alt="" width={18} height={18} draggable={false} />
          </p>
          <h1>
            A place to{' '}
            <span className="pl-word">
              <AnimatePresence mode="wait" initial={false}>
                <motion.em
                  key={current.id}
                  initial={reduceMotion ? false : { opacity: 0, y: '45%', filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: '-45%', filter: 'blur(6px)' }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  {current.verb}
                </motion.em>
              </AnimatePresence>
            </span>
          </h1>
          <p>Pick your portal and sign in with the account your school gave you.</p>
        </motion.div>

        <motion.div
          className="pl-stage"
          role="region"
          aria-roledescription="carousel"
          aria-label="School portals"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={onSwipeStart}
          onPointerUp={onSwipeEnd}
          onPointerCancel={() => { swipeStart.current = null }}
          onMouseEnter={() => setInteracted(true)}
        >
          <button type="button" className="pl-nav pl-nav-prev" onClick={() => step(-1)} aria-label="Previous portal"><ChevronLeft /></button>
          <div className="pl-ring">
            {portals.map((portal, index) => {
              let offset = mod(index - active)
              if (offset === COUNT - 1) offset = -1
              const isFront = offset === 0
              return (
                <Link
                  key={portal.id}
                  href={portal.href}
                  className="pl-slide"
                  data-portal={portal.id}
                  data-offset={offset}
                  aria-hidden={!isFront}
                  tabIndex={isFront ? 0 : -1}
                  onClick={event => onSlideClick(event, index)}
                >
                  {lastPortal === portal.id && <span className="pl-last">Last used</span>}
                  <span className="pl-slide-top">
                    <span className="pl-slide-icon" aria-hidden="true"><portal.icon /></span>
                    <span className="pl-slide-title">
                      <strong>{portal.title}</strong>
                      <small>Portal</small>
                    </span>
                    <span className="pl-art" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="pl-art-main" src={portal.art[0]} alt="" width={104} height={104} draggable={false} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="pl-art-accent" src={portal.art[1]} alt="" width={36} height={36} draggable={false} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="pl-art-spark" src="/student-icons/sparkles.png" alt="" width={22} height={22} draggable={false} />
                    </span>
                  </span>
                  <span className="pl-slide-body">
                    <span className="pl-slide-desc">{portal.description}</span>
                    <span className="pl-chips" aria-hidden="true">
                      {portal.features.map(([label, FeatureIcon]) => (
                        <span key={label} className="pl-chip"><FeatureIcon />{label}</span>
                      ))}
                    </span>
                    <span className="pl-slide-go">Enter {portal.title} portal <ArrowRight aria-hidden="true" /></span>
                  </span>
                </Link>
              )
            })}
          </div>
          <button type="button" className="pl-nav pl-nav-next" onClick={() => step(1)} aria-label="Next portal"><ChevronRight /></button>
        </motion.div>

        <nav className="pl-switch" aria-label="Sign in to a portal">
          {portals.map((portal, index) => (
            <Link
              key={portal.id}
              href={portal.href}
              data-portal={portal.id}
              data-testid={`portal-card-${portal.testId}`}
              data-active={index === active || undefined}
              aria-keyshortcuts={String(index + 1)}
              onPointerEnter={event => { if (event.pointerType === 'mouse') select(index) }}
              onFocus={() => select(index)}
              onClick={event => enter(event, portal.id, portal.href)}
            >
              <portal.icon aria-hidden="true" />
              <span>{portal.title}</span>
              <kbd aria-hidden="true">{index + 1}</kbd>
            </Link>
          ))}
        </nav>

        <p className="pl-help">
          <span className="pl-help-keys">Use <kbd>←</kbd> <kbd>→</kbd> to browse, <kbd>1</kbd>–<kbd>4</kbd> to jump in. </span>
          New here? Your school office will happily set up an account for you.
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
