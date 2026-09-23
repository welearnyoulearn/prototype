'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BarChart3, BookOpen, CalendarDays, Check, Clock3, MessageCircle, Sparkles, UsersRound } from 'lucide-react'

export type PortalIdentity = 'student' | 'teacher' | 'parent' | 'admin' | 'platform'

const portalCopy: Record<PortalIdentity, { eyebrow: string; title: string; note: string }> = {
  student: { eyebrow: 'Learn with momentum', title: 'Your next lesson is already waiting.', note: 'Syllabus, attendance and results move with you.' },
  teacher: { eyebrow: 'Teach with clarity', title: 'The class day, organised around you.', note: 'See the signal, take action and keep teaching.' },
  parent: { eyebrow: 'Stay meaningfully close', title: 'A calm view of your child’s school day.', note: 'The updates that matter, without the noise.' },
  admin: { eyebrow: 'Run the school day', title: 'People, learning and operations in rhythm.', note: 'One dependable workspace for the whole institution.' },
  platform: { eyebrow: 'Operate the platform', title: 'A precise view across every school.', note: 'Configuration, health and adoption in one place.' },
}

function StudentScene() {
  return (
    <div className="portal-visual-scene portal-visual-student" aria-hidden="true">
      <motion.div className="visual-orbit visual-orbit-a" animate={{ rotate: 360 }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="visual-orbit visual-orbit-b" animate={{ rotate: -360 }} transition={{ duration: 34, repeat: Infinity, ease: 'linear' }} />
      <div className="visual-focus-card">
        <span className="visual-kicker">Today · Science</span>
        <BookOpen className="visual-main-icon" />
        <strong>Light &amp; reflection</strong>
        <span className="visual-progress"><i style={{ width: '72%' }} /></span>
        <small>3 of 4 topics explored</small>
      </div>
      <motion.div className="visual-float visual-float-one" animate={{ y: [0, -7, 0] }} transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}><Sparkles /> 7 day streak</motion.div>
      <motion.div className="visual-float visual-float-two" animate={{ y: [0, 6, 0] }} transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}><Check /> Assignment done</motion.div>
    </div>
  )
}

function TeacherScene() {
  return (
    <div className="portal-visual-scene portal-visual-teacher" aria-hidden="true">
      <div className="teacher-board">
        <div className="teacher-board-top"><span>Grade 8 · A</span><span>09:10</span></div>
        <div className="teacher-board-title">Morning overview</div>
        <div className="teacher-board-row"><span><UsersRound /> Attendance</span><b>29 / 31</b></div>
        <div className="teacher-board-row"><span><BookOpen /> Next lesson</span><b>Fractions</b></div>
        <div className="teacher-board-row"><span><MessageCircle /> Open doubts</span><b>3</b></div>
      </div>
      <motion.div className="teacher-marker" animate={{ x: [0, 26, 26, 0], y: [0, 0, 34, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="visual-float visual-float-two" animate={{ y: [0, -5, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}><Check /> Attendance saved</motion.div>
    </div>
  )
}

function ParentScene() {
  return (
    <div className="portal-visual-scene portal-visual-parent" aria-hidden="true">
      <div className="parent-pulse">
        <div className="parent-pulse-copy"><span>This month</span><strong>94%</strong><small>attendance</small></div>
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" /><motion.circle cx="60" cy="60" r="48" initial={{ pathLength: 0 }} animate={{ pathLength: .94 }} transition={{ duration: 1.1, ease: 'easeOut' }} /></svg>
      </div>
      <div className="parent-timeline">
        <span><i /><b>Mathematics result released</b><small>Today · 3:20 PM</small></span>
        <span><i /><b>School circular received</b><small>Yesterday</small></span>
        <span><i /><b>Fee receipt confirmed</b><small>12 Aug</small></span>
      </div>
    </div>
  )
}

function AdminScene({ platform = false }: { platform?: boolean }) {
  return (
    <div className="portal-visual-scene portal-visual-admin" aria-hidden="true">
      <div className="admin-grid">
        <div className="admin-command"><span>{platform ? 'Platform pulse' : 'School pulse'}</span><b>{platform ? 'All systems healthy' : 'Tuesday · On track'}</b></div>
        <div className="admin-metric"><UsersRound /><span>{platform ? 'Schools' : 'People'}</span><b>{platform ? 'Connected' : 'Present'}</b></div>
        <div className="admin-metric"><CalendarDays /><span>Schedule</span><b>Ready</b></div>
        <div className="admin-chart"><span>Activity</span><div>{[42, 64, 48, 78, 68, 88, 74].map((h, i) => <motion.i key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * .05, duration: .45 }} />)}</div></div>
      </div>
      <motion.div className="admin-scan" animate={{ y: [0, 168, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}

export default function PortalIdentityVisual({ portal, compact = false }: { portal: PortalIdentity; compact?: boolean }) {
  const reduceMotion = useReducedMotion()
  const copy = portalCopy[portal]
  return (
    <div className={`portal-identity-visual ${compact ? 'is-compact' : ''}`} data-identity={portal}>
      <div className="portal-visual-copy">
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.note}</p>
      </div>
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, ease: [0.16, 1, 0.3, 1] }}>
        {portal === 'student' && <StudentScene />}
        {portal === 'teacher' && <TeacherScene />}
        {portal === 'parent' && <ParentScene />}
        {portal === 'admin' && <AdminScene />}
        {portal === 'platform' && <AdminScene platform />}
      </motion.div>
      <div className="portal-visual-foot"><Clock3 /> Built around the real school day</div>
    </div>
  )
}
