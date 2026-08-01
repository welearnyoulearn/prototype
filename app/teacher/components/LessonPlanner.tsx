'use client'

import { useState } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'

type LessonPlan = {
  objectives: string[]
  duration_minutes: number
  sections: { title: string; duration: string; activity: string; notes: string }[]
  materials: string[]
  assessment: string
  homework: string
}

type Props = {
  teacher: { id: number; name: string; subject: string }
  schoolId: number
}

const GRADE_OPTIONS = GRADE_SEQUENCE.filter(g => /^\d+$/.test(g))

export default function LessonPlanner({ teacher }: Props) {
  const [subject, setSubject]   = useState(teacher.subject || '')
  const [chapter, setChapter]   = useState('')
  const [topic, setTopic]       = useState('')
  const [grade, setGrade]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [plan, setPlan]         = useState<LessonPlan | null>(null)
  const [history, setHistory]   = useState<{ input: string; plan: LessonPlan }[]>([])
  const [printing, setPrinting] = useState(false)

  async function generate() {
    if (!subject.trim() || !topic.trim() || !grade) {
      setError('Subject, topic, and grade are required.')
      return
    }
    setLoading(true)
    setError('')
    setPlan(null)
    try {
      const res = await fetch('/api/ai/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), chapter: chapter.trim(), topic: topic.trim(), grade }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to generate'); return }
      setPlan(data)
      setHistory(h => [{ input: `${subject} — ${topic} (Grade ${grade})`, plan: data }, ...h.slice(0, 4)])
    } catch {
      setError('Connection error. Please try again.')
    }
    setLoading(false)
  }

  function printPlan() {
    setPrinting(true)
    setTimeout(() => { window.print(); setPrinting(false) }, 100)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Lesson Planner</h2>
        <p className="text-sm text-gray-500 mt-1">AI generates a complete structured lesson plan in seconds</p>
      </div>

      {/* Input card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Mathematics"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Grade</label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Select grade</option>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Chapter (optional)</label>
          <input
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            placeholder="e.g. Chapter 3 — Fractions"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Topic / Concept</label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Adding fractions with unlike denominators"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:shadow-md transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
              Generating lesson plan...
            </>
          ) : (
            <>✨ Generate Lesson Plan</>
          )}
        </button>
      </div>

      {/* Generated plan */}
      {plan && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold">{subject} — {topic}</p>
              <p className="text-blue-200 text-xs mt-0.5">Grade {grade} · {plan.duration_minutes} minutes</p>
            </div>
            <button
              onClick={printPlan}
              disabled={printing}
              className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Print / Save PDF
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Objectives */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Learning Objectives</p>
              <ul className="space-y-1">
                {plan.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                    {obj}
                  </li>
                ))}
              </ul>
            </div>

            {/* Lesson sections */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Lesson Plan</p>
              <div className="space-y-3">
                {plan.sections.map((s, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-gray-800">{s.title}</p>
                      <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full">{s.duration}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{s.activity}</p>
                    {s.notes && <p className="text-xs text-gray-400 italic">{s.notes}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Materials */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Materials Needed</p>
                <ul className="space-y-1">
                  {plan.materials.map((m, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Assessment</p>
                  <p className="text-sm text-gray-700">{plan.assessment}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Homework</p>
                  <p className="text-sm text-gray-700">{plan.homework}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent Plans</p>
          <div className="space-y-2">
            {history.slice(1).map((h, i) => (
              <button key={i} onClick={() => setPlan(h.plan)}
                className="w-full text-left text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
                {h.input}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
