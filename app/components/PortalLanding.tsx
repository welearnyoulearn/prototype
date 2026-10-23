'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type FormEvent, type MouseEvent, type PointerEvent,
} from 'react'
import {
  ArrowRight, BarChart3, Bell, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck,
  IndianRupee, ListChecks, LockKeyhole, Moon, PenLine, Sun, Sunrise, TrendingUp, Trophy, Users, Wallet,
} from 'lucide-react'
import { ParentIcon, SchoolIcon, StudentIcon, TeacherIcon } from './PortalIcons'
import { AuthError, AuthInput, PasswordField } from './AuthShell'
import { ButtonLoader } from '@/components/loaders'
import { setUsageSessionId } from '@/lib/usageSession'

type PortalId = 'student' | 'teacher' | 'parent' | 'admin'
type DayPart = 'morning' | 'afternoon' | 'evening'
type Icon = typeof BookOpen | typeof StudentIcon
type LoginConfig = {
  endpoint: string; field: 'rollNumber' | 'email' | 'identifier'; label: string; type: string; placeholder: string
  hint?: string; autoComplete: string; inputTestId: string; submit: string; forgot: string; changePassword: string; home: string
}

const portals: Array<{
  id: PortalId; testId: string; title: string; verb: string; description: string; href: string; icon: Icon; features: Array<[string, Icon]>; art: [string, string]
  login: LoginConfig
}> = [
  { id: 'student', testId: 'student', title: 'Student', verb: 'learn.', description: 'Your lessons, attendance, results and every win along the way.', href: '/student/login', icon: StudentIcon, art: ['/landing/student-3d.png', '/student-icons/books.png'], features: [['Lessons', BookOpen], ['Attendance', CalendarCheck], ['Achievements', Trophy]],
    login: { endpoint: '/api/student/auth/login', field: 'rollNumber', label: 'Roll number', type: 'text', placeholder: 'e.g. 2024-GR9-001', hint: 'Shared in your welcome email', autoComplete: 'username', inputTestId: 'student-roll-input', submit: 'Open my workspace', forgot: '/student/forgot-password', changePassword: '/student/change-password', home: '/student' } },
  { id: 'teacher', testId: 'teacher', title: 'Teacher', verb: 'teach.', description: 'Your classes, attendance, marks and syllabus, all in one calm place.', href: '/teacher/login', icon: TeacherIcon, art: ['/landing/teacher-3d.png', '/student-icons/light-bulb.png'], features: [['Attendance', ClipboardCheck], ['Marks', PenLine], ['Syllabus', ListChecks]],
    login: { endpoint: '/api/teacher/auth/login', field: 'email', label: 'Email address', type: 'email', placeholder: 'your.email@school.edu', autoComplete: 'email', inputTestId: 'teacher-email-input', submit: 'Sign in', forgot: '/teacher/forgot-password', changePassword: '/teacher/change-password', home: '/teacher' } },
  { id: 'parent', testId: 'parent', title: 'Parent', verb: 'stay close.', description: "Your child's progress, school notices and fees, always within reach.", href: '/parent/login', icon: ParentIcon, art: ['/landing/parent-3d.png', '/landing/heart-3d.png'], features: [['Progress', TrendingUp], ['Notices', Bell], ['Fees', Wallet]],
    login: { endpoint: '/api/parent/auth/login', field: 'identifier', label: 'Email or phone number', type: 'text', placeholder: 'your@email.com or phone', autoComplete: 'username', inputTestId: 'parent-email-input', submit: 'Sign in', forgot: '/parent/forgot-password', changePassword: '/parent/change-password', home: '/parent' } },
  { id: 'admin', testId: 'school-admin', title: 'School', verb: 'lead.', description: 'Staff, students, fees and the everyday running of your school.', href: '/login?role=school', icon: SchoolIcon, art: ['/landing/school-3d.png', '/student-icons/trophy.png'], features: [['People', Users], ['Fees', IndianRupee], ['Reports', BarChart3]],
    login: { endpoint: '/api/auth/login', field: 'email', label: 'Email address', type: 'text', placeholder: 'you@school.com', autoComplete: 'email', inputTestId: 'school-email-input', submit: 'Sign in', forgot: '/forgot-password', changePassword: '/change-password?first=1', home: '/school-admin' } },
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

function SignInForm({ portal, onBack }: { portal: (typeof portals)[number]; onBack: () => void }) {
  const router = useRouter()
  const { login } = portal
  const formRef = useRef<HTMLFormElement>(null)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { formRef.current?.querySelector('input')?.focus() }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch(login.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [login.field]: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      setUsageSessionId(data.usageSessionId)
      try { localStorage.setItem(LAST_PORTAL_KEY, portal.id) } catch {}

      if (portal.id === 'admin') {
        if (data.role === 'platform_admin') {
          window.location.href = data.firstLogin ? '/change-password?first=1&portal=platform' : '/platform-admin'
        } else if (['school_admin', 'principal', 'vice_principal'].includes(data.role)) {
          if (data.account) {
            try { localStorage.setItem('wlyl_last_staff_account', JSON.stringify({ name: data.account.name, email: data.account.email, role: data.account.role })) } catch {}
          }
          if (data.firstLogin) router.push('/change-password?first=1')
          else if (!data.profileCompleted) router.push('/profile-setup')
          else router.push('/school-admin')
        } else {
          setError('This portal is for school staff only. Please pick the right portal.')
        }
        return
      }
      router.push(data.passwordChanged ? login.home : login.changePassword)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="pl-form" data-testid={`${portal.testId}-login-form`}>
      <AuthError message={error} />
      <AuthInput label={login.label} type={login.type} value={identifier} onChange={setIdentifier} placeholder={login.placeholder}
        hint={login.hint} autoComplete={login.autoComplete} testId={login.inputTestId} ring="" />
      <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Enter your password" ring="" autoComplete="current-password" />
      <div className="pl-form-row">
        <button type="button" className="pl-form-back" onClick={onBack} data-testid={`${portal.testId}-back-btn`}><ChevronLeft aria-hidden="true" /> Back</button>
        <Link href={login.forgot}>Forgot password?</Link>
      </div>
      <button type="submit" disabled={loading} className="pl-slide-go" data-testid={`${portal.testId}-submit-btn`}>
        {loading ? <ButtonLoader label="Signing in…" /> : login.submit}
      </button>
    </form>
  )
}

// Who runs WLYL, shown in the footer (the payment gateway checks the site names its KYC holder)
type Operator = { legalName: string; email: string; phone: string }

export default function PortalLanding({ operator }: { operator: Operator }) {
  const reduceMotion = useReducedMotion()
  const lastPortal = useSyncExternalStore(subscribeToStorage, readLastPortal, () => null)
  const dayPart = useSyncExternalStore(noopSubscribe, readDayPart, () => null)
  const [turn, setTurn] = useState(0)
  const [interacted, setInteracted] = useState(false)
  const [signIn, setSignIn] = useState<PortalId | null>(null)
  const swipeStart = useRef<number | null>(null)
  const swiped = useRef(false)

  const active = mod(turn)
  const current = portals[active]

  const select = useCallback((index: number) => {
    if (signIn) return
    setInteracted(true)
    setTurn(t => {
      let delta = index - mod(t)
      if (delta > COUNT / 2) delta -= COUNT
      if (delta < -COUNT / 2) delta += COUNT
      return t + delta
    })
  }, [signIn])

  const step = useCallback((direction: 1 | -1) => {
    if (signIn) return
    setInteracted(true)
    setTurn(t => t + direction)
  }, [signIn])

  // Opens the sign-in form inside the portal's own card and freezes the carousel on it.
  const openPortal = useCallback((id: PortalId) => {
    setInteracted(true)
    setTurn(t => {
      let delta = portals.findIndex(p => p.id === id) - mod(t)
      if (delta > COUNT / 2) delta -= COUNT
      if (delta < -COUNT / 2) delta += COUNT
      return t + delta
    })
    setSignIn(id)
  }, [])

  function enter(event: MouseEvent<HTMLElement>, id: PortalId) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    openPortal(id)
  }

  // Gently turns on its own so first-time visitors see every portal, and
  // stops for good the moment someone interacts.
  useEffect(() => {
    if (interacted || reduceMotion || signIn) return
    const id = window.setInterval(() => setTurn(t => t + 1), AUTO_TURN_MS)
    return () => window.clearInterval(id)
  }, [interacted, reduceMotion, signIn])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (event.key === 'Escape' && signIn) { setSignIn(null); return }
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); return }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); return }
      const portal = portals[Number(event.key) - 1]
      if (portal && !signIn) openPortal(portal.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPortal, step, signIn])

  function parallax(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return
    const el = event.currentTarget
    el.style.setProperty('--mx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
    el.style.setProperty('--my', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
  }

  function onSwipeStart(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' || signIn) return
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

  function onSlideClick(index: number) {
    if (swiped.current) { swiped.current = false; return }
    if (index !== active) select(index)
  }

  const GreetingIcon = dayPart ? greetingIcon[dayPart] : Sun

  return (
    <div
      className="pl-shell"
      onPointerMove={parallax}
      data-active={current.id}
      data-signin={signIn ?? undefined}
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
                <div
                  key={portal.id}
                  className="pl-slide"
                  data-portal={portal.id}
                  data-offset={offset}
                  aria-hidden={!isFront}
                  data-signin={isFront && signIn === portal.id ? '' : undefined}
                  onClick={() => onSlideClick(index)}
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
                    {isFront && signIn === portal.id ? (
                      <SignInForm portal={portal} onBack={() => setSignIn(null)} />
                    ) : (
                      <>
                        <span className="pl-slide-desc">{portal.description}</span>
                        <span className="pl-chips" aria-hidden="true">
                          {portal.features.map(([label, FeatureIcon]) => (
                            <span key={label} className="pl-chip"><FeatureIcon />{label}</span>
                          ))}
                        </span>
                        <button
                          type="button"
                          className="pl-slide-go"
                          tabIndex={isFront ? 0 : -1}
                          data-testid={`enter-${portal.testId}`}
                          onClick={event => { if (isFront) { event.stopPropagation(); openPortal(portal.id) } }}
                        >
                          Enter {portal.title} portal <ArrowRight aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </span>
                </div>
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
              onClick={event => enter(event, portal.id)}
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
        <span data-testid="footer-operator">
          © {new Date().getFullYear()} WeLearnYouLearn · operated by {operator.legalName} ·{' '}
          <a href={`mailto:${operator.email}`}>{operator.email}</a> · {operator.phone}
        </span>
        <nav aria-label="Policies" className="pl-footer-links">
          <Link href="/pricing" data-testid="footer-pricing">Pricing</Link>
          <Link href="/terms" data-testid="footer-terms">Terms</Link>
          <Link href="/privacy" data-testid="footer-privacy">Privacy</Link>
          <Link href="/refund-policy" data-testid="footer-refund">Refunds</Link>
          <Link href="/contact" data-testid="footer-contact">Contact</Link>
          <Link href="/admin">Platform administration</Link>
        </nav>
      </footer>

    </div>
  )
}
