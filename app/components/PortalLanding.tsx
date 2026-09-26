'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import { ArrowRight, BookOpen, Building2, LockKeyhole, Presentation, UsersRound } from 'lucide-react'

type PortalId = 'student' | 'teacher' | 'parent' | 'admin'

const portals: Array<{ id: PortalId; testId: string; title: string; description: string; href: string; icon: typeof BookOpen }> = [
  { id: 'student', testId: 'student', title: 'Student', description: 'Lessons, attendance, marks and achievements', href: '/student/login', icon: BookOpen },
  { id: 'teacher', testId: 'teacher', title: 'Teacher', description: 'Classes, attendance, exam marks and syllabus', href: '/teacher/login', icon: Presentation },
  { id: 'parent', testId: 'parent', title: 'Parent', description: "Your child's progress, notices and fees", href: '/parent/login', icon: UsersRound },
  { id: 'admin', testId: 'school-admin', title: 'School', description: 'Staff, students, fees and daily operations', href: '/login?role=school', icon: Building2 },
]

const LAST_PORTAL_KEY = 'wlyl:last-portal'

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

export default function PortalLanding() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const lastPortal = useSyncExternalStore(subscribeToStorage, readLastPortal, () => null)
  const [transitioning, setTransitioning] = useState<PortalId | null>(null)
  const [origin, setOrigin] = useState({ x: '50%', y: '50%' })

  function enterPortal(event: MouseEvent<HTMLAnchorElement>, id: PortalId, href: string) {
    try { localStorage.setItem(LAST_PORTAL_KEY, id) } catch {}
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || reduceMotion) return
    event.preventDefault()
    setOrigin({ x: `${event.clientX}px`, y: `${event.clientY}px` })
    setTransitioning(id)
    window.setTimeout(() => router.push(href), 260)
  }

  return (
    <div
      className="pl-shell"
      data-transitioning={transitioning ?? undefined}
      style={{ '--transition-x': origin.x, '--transition-y': origin.y } as CSSProperties}
    >
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
          <h1>Welcome. <em>Choose your portal.</em></h1>
          <p>Sign in with the account your school gave you.</p>
        </motion.div>

        <nav className="pl-grid" aria-label="School portals">
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
                onClick={event => enterPortal(event, portal.id, portal.href)}
              >
                {lastPortal === portal.id && <span className="pl-last">Last used</span>}
                <span className="pl-card-icon" aria-hidden="true"><portal.icon /></span>
                <span className="pl-card-text">
                  <strong>{portal.title}</strong>
                  <span>{portal.description}</span>
                </span>
                <span className="pl-card-go">Sign in <ArrowRight aria-hidden="true" /></span>
              </Link>
            </motion.div>
          ))}
        </nav>

        <p className="pl-help">Don&apos;t have an account yet? Your school office can set one up for you.</p>
      </main>

      <footer className="pl-footer">
        <span>© {new Date().getFullYear()} WeLearnYouLearn</span>
        <Link href="/admin">Platform administration</Link>
      </footer>

      <div className="pl-wash" aria-hidden="true" />
    </div>
  )
}
