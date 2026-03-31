'use client'

import { useEffect, useState } from 'react'

type Topic = {
  id: number
  subject: string
  chapter_name: string
  chapter_order: number
  topic_name: string
  topic_order: number
  status: string
  covered_date: string | null
  covered_by_name: string | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  total: number
  covered: number
  topics: Topic[]
}

type Subject = {
  subject: string
  total: number
  covered: number
  completion_pct: number
  chapters: Chapter[]
}

type Props = {
  schoolId: number
  classId: number
}

export default function StudentSyllabus({ schoolId, classId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(d => {
        setSubjects(d.subjects || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [schoolId, classId])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse max-w-2xl mx-auto">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500 max-w-md mx-auto">
        <p className="text-4xl mb-3">📚</p>
        <p className="font-medium text-gray-700">No syllabus yet</p>
        <p className="text-sm mt-1">Your teacher hasn&apos;t added the syllabus for your class yet.</p>
      </div>
    )
  }

  const overallTotal = subjects.reduce((s, subj) => s + subj.total, 0)
  const overallCovered = subjects.reduce((s, subj) => s + subj.covered, 0)
  const overallPct = overallTotal > 0 ? Math.round(100 * overallCovered / overallTotal) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Overall progress */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700">Overall Syllabus Coverage</h3>
          <span className="text-lg font-bold text-indigo-600">{overallPct}%</span>
        </div>
        <ProgressBar pct={overallPct} color="bg-indigo-500" />
        <p className="text-xs text-gray-500 mt-2">{overallCovered} of {overallTotal} topics covered</p>
      </div>

      {/* Subject cards */}
      {subjects.map(subj => {
        const isExpanded = expandedSubject === subj.subject
        const pctColor = subj.completion_pct >= 75 ? 'bg-green-500' : subj.completion_pct >= 40 ? 'bg-amber-400' : 'bg-blue-500'

        return (
          <div key={subj.subject} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Subject header */}
            <button
              onClick={() => setExpandedSubject(isExpanded ? null : subj.subject)}
              className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">{subj.subject}</span>
                  <span className={`text-sm font-bold ${
                    subj.completion_pct >= 75 ? 'text-green-600' :
                    subj.completion_pct >= 40 ? 'text-amber-600' : 'text-blue-600'
                  }`}>{subj.completion_pct}%</span>
                </div>
                <ProgressBar pct={subj.completion_pct} color={pctColor} />
                <p className="text-xs text-gray-500 mt-1">{subj.covered}/{subj.total} topics covered</p>
              </div>
              <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {/* Chapters */}
            {isExpanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {subj.chapters.map(ch => {
                  const chKey = `${subj.subject}-${ch.chapter_name}`
                  const chExpanded = expandedChapter === chKey
                  const chPct = ch.total > 0 ? Math.round(100 * ch.covered / ch.total) : 0

                  return (
                    <div key={ch.chapter_name}>
                      <button
                        onClick={() => setExpandedChapter(chExpanded ? null : chKey)}
                        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">{ch.chapter_name}</span>
                            <span className="text-xs text-gray-500">{ch.covered}/{ch.total}</span>
                          </div>
                        </div>
                        <ChapterStatusDot pct={chPct} />
                        <span className={`text-gray-300 text-xs transition-transform ${chExpanded ? 'rotate-180' : ''}`}>▼</span>
                      </button>

                      {/* Topics */}
                      {chExpanded && (
                        <div className="bg-gray-50 px-5 pb-3 space-y-2">
                          {ch.topics.map(topic => (
                            <div key={topic.id} className="flex items-center gap-3 py-1.5">
                              <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
                                topic.status === 'covered'
                                  ? 'bg-green-500'
                                  : 'bg-gray-200 border border-gray-300'
                              }`}>
                                {topic.status === 'covered' && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className={`text-sm flex-1 ${topic.status === 'covered' ? 'text-gray-600' : 'text-gray-800'}`}>
                                {topic.topic_name}
                              </span>
                              {topic.covered_date && (
                                <span className="text-xs text-gray-400">
                                  {new Date(topic.covered_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  )
}

function ChapterStatusDot({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-200'
  return <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
}
