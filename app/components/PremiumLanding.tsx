'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, Building2, Check, GraduationCap, LineChart, Presentation, ShieldCheck, UsersRound } from 'lucide-react'
import PortalIdentityVisual, { type PortalIdentity } from './PortalIdentityVisual'

const portals: Array<{ id: PortalIdentity; title: string; role: string; description: string; href: string; icon: typeof BookOpen; signal: string }> = [
  { id: 'student', title: 'Student', role: 'Learn', description: 'Lessons, attendance, results and achievements in one personal learning rhythm.', href: '/student/login', icon: BookOpen, signal: 'Continue where you left off' },
  { id: 'teacher', title: 'Teacher', role: 'Teach', description: 'Classes, attendance, syllabus and student signals arranged around the teaching day.', href: '/teacher/login', icon: Presentation, signal: 'See what needs attention' },
  { id: 'parent', title: 'Parent', role: 'Stay close', description: 'A trusted view of progress, attendance, school updates and fees.', href: '/parent/login', icon: UsersRound, signal: 'Know what changed today' },
  { id: 'admin', title: 'Institution', role: 'Operate', description: 'People, academics and operations coordinated from one dependable workspace.', href: '/login?role=school', icon: Building2, signal: 'Keep the school in rhythm' },
]

const reveal = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

export default function PremiumLanding() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [transitioning, setTransitioning] = useState<PortalIdentity | null>(null)

  function enterPortal(event: React.MouseEvent<HTMLAnchorElement>, portal: PortalIdentity, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (reduceMotion) { router.push(href); return }
    setTransitioning(portal)
    window.setTimeout(() => router.push(href), 260)
  }

  return (
    <div className="landing-shell" data-transitioning={transitioning ?? undefined}>
      <a href="#portal-selection" className="landing-skip">Skip to portal selection</a>
      <header className="landing-header">
        <Link href="/" className="brand-lockup" aria-label="WeLearnYouLearn home"><span>W</span><b>WeLearnYouLearn</b></Link>
        <nav aria-label="Landing page"><a href="#how-it-works">How it works</a><a href="#portal-selection">Workspaces</a><a href="#capabilities">Capabilities</a></nav>
        <a href="#portal-selection" className="landing-header-cta">Open your workspace <ArrowRight /></a>
      </header>

      <main>
        <section className="landing-hero">
          <motion.div className="landing-hero-copy" initial={reduceMotion ? false : 'hidden'} animate="show" variants={reveal} transition={{ duration: .65, ease: [0.16, 1, 0.3, 1] }}>
            <p className="landing-eyebrow"><span /> One connected school day</p>
            <h1>Every school moment,<br /><em>moving together.</em></h1>
            <p className="landing-lede">WeLearnYouLearn connects learning, teaching, families and school operations without losing the human context behind the data.</p>
            <div className="landing-hero-actions"><a href="#portal-selection" className="landing-primary">Choose your workspace <ArrowRight /></a><a href="#how-it-works" className="landing-text-link">See the school day flow <ArrowUpRight /></a></div>
            <div className="landing-trust"><ShieldCheck /><span>Private by design</span><i /><span>Built for real school workflows</span></div>
          </motion.div>

          <motion.div className="product-stage" initial={false} aria-label="Product overview">
            <div className="product-window">
              <div className="product-window-bar"><span className="product-mark">W</span><span>School overview</span><i /><i /><i /></div>
              <div className="product-layout">
                <aside><b>Today</b><span className="active">Overview</span><span>Attendance</span><span>Learning</span><span>People</span><span>Reports</span></aside>
                <div className="product-content">
                  <div className="product-greeting"><span>Tuesday, 19 September</span><strong>Good morning, Greenwood.</strong><p>The school day is moving well.</p></div>
                  <div className="product-pulse-row">
                    <div><span>Attendance</span><b>Morning complete</b><small><Check /> 12 classes marked</small></div>
                    <div><span>Learning</span><b>24 topics in progress</b><small><BookOpen /> Across 8 grades</small></div>
                    <div><span>Communication</span><b>3 updates</b><small><UsersRound /> Families notified</small></div>
                  </div>
                  <div className="product-lower">
                    <div className="product-flow"><span>Live school rhythm</span>{['Gate opened', 'Attendance marked', 'Lesson updated', 'Parent notified'].map((t, i) => <motion.p key={t} initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .7 + i * .12 }}><i />{t}<small>{['8:05', '9:12', '10:40', '10:41'][i]}</small></motion.p>)}</div>
                    <div className="product-chart"><span>Weekly engagement</span><div>{[36, 52, 46, 68, 58, 81, 72, 88].map((h, i) => <motion.i key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: .55 + i * .06, duration: .5 }} />)}</div></div>
                  </div>
                </div>
              </div>
            </div>
            <motion.div className="stage-note stage-note-one" animate={reduceMotion ? {} : { y: [0, -6, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}><span><Check /></span><b>Attendance synced</b><small>Teacher → School → Parent</small></motion.div>
            <motion.div className="stage-note stage-note-two" animate={reduceMotion ? {} : { y: [0, 7, 0] }} transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}><span><LineChart /></span><b>Progress made visible</b><small>Without extra reporting</small></motion.div>
          </motion.div>
        </section>

        <section className="landing-proof" aria-label="Product principles"><p><b>4</b><span>connected workspaces</span></p><p><b>1</b><span>shared school record</span></p><p><b>All day</b><span>context that stays connected</span></p></section>

        <section id="how-it-works" className="story-section">
          <motion.div className="story-heading" initial={false} whileInView="show" viewport={{ once: true, amount: .35 }} variants={reveal} transition={{ duration: .55 }}><p className="landing-eyebrow"><span /> One action, useful everywhere</p><h2>The school day should flow.<br />The software should keep up.</h2><p>Information moves to the right person at the right moment, while each role keeps a workspace shaped around their task.</p></motion.div>
          <div className="story-flow">
            {[
              ['01', 'Teacher marks attendance', 'A quick class action, designed for the moment it happens.'],
              ['02', 'The school view updates', 'Operations see completion and exceptions without chasing a report.'],
              ['03', 'Families receive context', 'Parents see a useful update in the same trusted record.'],
              ['04', 'The student stays focused', 'Their workspace keeps learning at the centre.'],
            ].map(([n, title, text]) => <motion.article key={n} initial={false}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></motion.article>)}
          </div>
        </section>

        <section id="portal-selection" className="portal-ecosystem">
          <div className="portal-heading"><div><p className="landing-eyebrow"><span /> Choose your perspective</p><h2>One product.<br />Four distinct workspaces.</h2></div><p>Each portal has its own priorities, pace and visual language, while the school record remains connected underneath.</p></div>
          <nav className="portal-grid" aria-label="School portals">
            {portals.map((portal) => (
              <motion.div key={portal.id} initial={false} className={`portal-entry portal-entry-${portal.id}`}>
                <Link href={portal.href} onClick={event => enterPortal(event, portal.id, portal.href)} data-testid={`portal-card-${portal.id === 'admin' ? 'school-admin' : portal.id}`}>
                  <span className="portal-entry-top"><i><portal.icon /></i><small>{portal.role}</small></span>
                  <strong>{portal.title}</strong><p>{portal.description}</p>
                  <span className="portal-entry-signal">{portal.signal}<ArrowRight /></span>
                </Link>
              </motion.div>
            ))}
          </nav>
        </section>

        <section id="capabilities" className="capability-section">
          <div className="capability-intro"><p className="landing-eyebrow"><span /> Designed around confidence</p><h2>Less searching.<br />More knowing what to do next.</h2></div>
          <div className="capability-lines">
            <article><GraduationCap /><span>Learning continuity</span><h3>From syllabus to result, the story stays connected.</h3><p>Teachers teach, students learn and families follow progress from the same source of truth.</p></article>
            <article><LineChart /><span>Operational clarity</span><h3>Signals appear before they become problems.</h3><p>Attendance, fees, staffing and school activity remain visible without turning the day into reporting work.</p></article>
            <article><ShieldCheck /><span>Trusted access</span><h3>Each person sees the context meant for them.</h3><p>Role-specific workspaces keep sensitive school information clear, focused and appropriately scoped.</p></article>
          </div>
        </section>

        <section className="landing-cta"><PortalIdentityVisual portal="student" compact /><div><p className="landing-eyebrow"><span /> Your school day is ready</p><h2>Enter the workspace built around your role.</h2><p>Your account is provided by your school. Choose a portal to continue.</p><a href="#portal-selection" className="landing-primary">Choose your workspace <ArrowRight /></a></div></section>
      </main>

      <footer className="landing-footer"><div className="brand-lockup"><span>W</span><b>WeLearnYouLearn</b></div><p>School management, connected around people.</p><Link href="/admin">Platform administration <ArrowUpRight /></Link></footer>
      <div className="portal-transition-wash" aria-hidden="true" />
    </div>
  )
}
