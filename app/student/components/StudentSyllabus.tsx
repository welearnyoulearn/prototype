'use client'

import { useEffect, useState } from 'react'
import TopicContentViewer from '@/app/components/TopicContentViewer'

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
  content_text?: string
  content_pdf_url?: string
  questions?: any
  resources?: any
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

const SUBJECT_THEMES: Record<string, { borderLeft: string; text: string; bgLight: string; border: string; accent: string; icon: string }> = {
  'mathematics': {
    borderLeft: 'border-l-indigo-600',
    text: 'text-indigo-600',
    bgLight: 'bg-indigo-50/50',
    border: 'border-indigo-100',
    accent: 'bg-indigo-600',
    icon: '📐'
  },
  'science': {
    borderLeft: 'border-l-teal-600',
    text: 'text-teal-600',
    bgLight: 'bg-teal-50/50',
    border: 'border-teal-100',
    accent: 'bg-teal-600',
    icon: '🧪'
  },
  'english': {
    borderLeft: 'border-l-orange-500',
    text: 'text-orange-600',
    bgLight: 'bg-orange-50/50',
    border: 'border-orange-100',
    accent: 'bg-orange-500',
    icon: '📖'
  },
  'social science': {
    borderLeft: 'border-l-purple-600',
    text: 'text-purple-600',
    bgLight: 'bg-purple-50/50',
    border: 'border-purple-100',
    accent: 'bg-purple-600',
    icon: '🌍'
  },
}

function getSubjectTheme(subjName: string) {
  const norm = subjName.toLowerCase().trim()
  if (norm.includes('math')) return SUBJECT_THEMES['mathematics']
  if (norm.includes('science')) return SUBJECT_THEMES['science']
  if (norm.includes('english')) return SUBJECT_THEMES['english']
  if (norm.includes('social')) return SUBJECT_THEMES['social science']
  
  // Default fallback
  return {
    borderLeft: 'border-l-slate-400',
    text: 'text-slate-600',
    bgLight: 'bg-slate-50/50',
    border: 'border-slate-100',
    accent: 'bg-slate-600',
    icon: '📚'
  }
}

export default function StudentSyllabus({ schoolId, classId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'covered' | 'pending'>('all')

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
      <div className="space-y-4 animate-pulse max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-3xl" />)}
        </div>
        <div className="h-14 bg-gray-200 rounded-2xl" />
        <div className="h-40 bg-gray-200 rounded-3xl" />
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500 max-w-md mx-auto">
        <p className="text-4xl mb-3">📚</p>
        <p className="font-semibold text-gray-700">No syllabus yet</p>
        <p className="text-xs text-gray-400 mt-1">Your teacher hasn&apos;t mapped the syllabus for your class yet.</p>
      </div>
    )
  }

  // Calculate overall stats
  const overallTotal = subjects.reduce((s, subj) => s + subj.total, 0)
  const overallCovered = subjects.reduce((s, subj) => s + subj.covered, 0)
  const overallPct = overallTotal > 0 ? Math.round(100 * overallCovered / overallTotal) : 0

  // Calculate Next Up target recommendation
  const getNextUpTopic = () => {
    for (const subj of subjects) {
      for (const ch of subj.chapters) {
        for (const topic of ch.topics) {
          if (topic.status !== 'covered') {
            return {
              subjectName: subj.subject,
              chapterName: ch.chapter_name,
              topic
            }
          }
        }
      }
    }
    return null
  }
  const nextUp = getNextUpTopic()

  const handleNextUpClick = (rec: { subjectName: string; chapterName: string; topic: Topic }) => {
    setExpandedSubject(rec.subjectName)
    setExpandedChapter(`${rec.subjectName}-${rec.chapterName}`)
    setActiveTopic(rec.topic)
  }

  // Filter subjects based on query & status
  const getFilteredSubjects = () => {
    return subjects.map(subj => {
      const filteredChapters = subj.chapters.map(ch => {
        const filteredTopics = ch.topics.filter(topic => {
          const matchesSearch = 
            topic.topic_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ch.chapter_name.toLowerCase().includes(searchQuery.toLowerCase())
          
          const matchesStatus = 
            statusFilter === 'all' ||
            (statusFilter === 'covered' && topic.status === 'covered') ||
            (statusFilter === 'pending' && topic.status !== 'covered')
          
          return matchesSearch && matchesStatus
        })

        return {
          ...ch,
          topics: filteredTopics
        }
      }).filter(ch => ch.topics.length > 0)

      return {
        ...subj,
        chapters: filteredChapters
      }
    }).filter(subj => subj.chapters.length > 0)
  }

  const filteredSubjects = getFilteredSubjects()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* ── TOP STATS GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Overall Completion Gauge */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall Progress</p>
            <p className="text-sm font-black text-slate-800 mt-1">Syllabus Completion</p>
          </div>
          <RadialProgress pct={overallPct} />
        </div>

        {/* Covered Count Card */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 bg-green-50 border border-green-100 text-green-600 rounded-2xl flex items-center justify-center text-lg shadow-inner font-extrabold">
            ✓
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Topics Completed</p>
            <p className="text-base font-black text-slate-800 mt-0.5">{overallCovered} / {overallTotal}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">topics covered</p>
          </div>
        </div>

        {/* Subjects Enrolled Card */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-lg shadow-inner">
            📚
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Subjects</p>
            <p className="text-base font-black text-slate-800 mt-0.5">{subjects.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">enrolled tracks</p>
          </div>
        </div>
      </div>

      {/* ── "NEXT UP" HERO RECOMMENDATION ── */}
      {nextUp ? (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-indigo-900/40 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative space-y-1">
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              🎯 Next Study Goal
            </span>
            <h4 className="text-sm font-black text-slate-100">
              {nextUp.topic.topic_name}
            </h4>
            <p className="text-[10px] text-slate-300">
              Chapter {nextUp.topic.chapter_order || 1}: {nextUp.chapterName} · {nextUp.subjectName}
            </p>
          </div>
          <button
            onClick={() => handleNextUpClick(nextUp)}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <span>📖 Learn Now</span>
            <span className="text-xs">→</span>
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-3xl p-5 shadow-lg text-center relative overflow-hidden">
          <p className="text-2xl">🎉</p>
          <h4 className="text-sm font-black mt-1">Outstanding Job!</h4>
          <p className="text-xs text-emerald-100 mt-0.5">You have covered 100% of your current school syllabus!</p>
        </div>
      )}

      {/* ── SEARCH & FILTERS BAR ── */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search chapters or topics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/70 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-all"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'pending', 'covered'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-xl text-2xs font-black uppercase tracking-wider transition-all duration-200 ${
                statusFilter === f
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-100'
              }`}
            >
              {f === 'all' ? 'All' : f === 'pending' ? 'To Do' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {/* ── FILTERED SUBJECTS ACCORDION LIST ── */}
      <div className="space-y-4">
        {filteredSubjects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 text-slate-400">
            <p className="text-2xl mb-1">🔍</p>
            <p className="text-xs font-semibold text-slate-500">No matching topics found</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Try adjusting your search query or status filter</p>
          </div>
        ) : (
          filteredSubjects.map(subj => {
            const theme = getSubjectTheme(subj.subject)
            const isExpanded = expandedSubject === subj.subject

            return (
              <div
                key={subj.subject}
                className={`bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border-l-4 ${
                  isExpanded ? theme.borderLeft : 'border-l-transparent'
                }`}
              >
                {/* Subject header */}
                <button
                  onClick={() => setExpandedSubject(isExpanded ? null : subj.subject)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl shrink-0 border border-slate-100 shadow-inner">
                    {theme.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black text-slate-800">{subj.subject}</span>
                      <span className={`text-xs font-black ${theme.text}`}>
                        {subj.completion_pct}%
                      </span>
                    </div>
                    <ProgressBar pct={subj.completion_pct} color={theme.accent} />
                    <p className="text-3xs font-semibold text-slate-400 mt-1">
                      {subj.covered} of {subj.total} topics completed
                    </p>
                  </div>
                  <span className={`text-slate-300 text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180 text-slate-500' : ''}`}>▼</span>
                </button>

                {/* Chapters */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {subj.chapters.map(ch => {
                      const chKey = `${subj.subject}-${ch.chapter_name}`
                      const chExpanded = expandedChapter === chKey
                      const chPct = ch.total > 0 ? Math.round(100 * ch.covered / ch.total) : 0

                      return (
                        <div key={ch.chapter_name} className="bg-slate-50/20">
                          {/* Chapter Header */}
                          <button
                            onClick={() => setExpandedChapter(chExpanded ? null : chKey)}
                            className={`w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left ${
                              chExpanded ? 'bg-slate-50/60 font-semibold' : ''
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700">{ch.chapter_name}</span>
                                <span className="text-3xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                  {ch.covered}/{ch.total} covered
                                </span>
                              </div>
                            </div>
                            <ChapterStatusDot pct={chPct} />
                            <span className={`text-slate-300 text-xs transition-transform duration-200 ${chExpanded ? 'rotate-180 text-slate-500' : ''}`}>▼</span>
                          </button>

                          {/* Topics List */}
                          {chExpanded && (
                            <div className="bg-slate-50/40 px-4 pb-4 pt-1 space-y-2 relative border-t border-slate-100/50">
                              {/* Timeline vertical bar */}
                              <div 
                                className="absolute top-3 bottom-6 w-[2px] bg-slate-200/60 pointer-events-none" 
                                style={{ left: '23px' }}
                              />

                              {ch.topics.map(topic => {
                                const hasResources = Array.isArray(topic.resources) && topic.resources.length > 0
                                const isCovered = topic.status === 'covered'

                                return (
                                  <button
                                    key={topic.id}
                                    onClick={() => setActiveTopic(topic)}
                                    className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-left bg-white border border-slate-100/80 hover:border-indigo-200 hover:shadow-sm transition-all duration-200 group relative"
                                  >
                                    {/* Circle icon */}
                                    <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center z-10 transition-all ${
                                      isCovered
                                        ? 'bg-green-500 shadow-md shadow-green-100'
                                        : 'bg-white border-2 border-slate-300 group-hover:border-indigo-500'
                                    }`}>
                                      {isCovered ? (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors" />
                                      )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs font-bold truncate ${
                                        isCovered
                                          ? 'text-slate-400 line-through'
                                          : 'text-slate-700 group-hover:text-slate-900'
                                      }`}>
                                        {topic.topic_name}
                                      </p>
                                      
                                      {isCovered && (topic.covered_date || topic.covered_by_name) && (
                                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                          {topic.covered_date && `Completed on ${new Date(topic.covered_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                                          {topic.covered_by_name && ` by ${topic.covered_by_name}`}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {/* Resource badges */}
                                      {hasResources && (
                                        <div className="flex items-center gap-1">
                                          {topic.resources.some((r: any) => r.resource_type === 'video') && (
                                            <span className="text-[9px] bg-red-50 border border-red-100/60 text-red-500 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5 shadow-3xs" title="Video lesson available">
                                              ▶ Video
                                            </span>
                                          )}
                                          {topic.resources.some((r: any) => r.resource_type !== 'video') && (
                                            <span className="text-[9px] bg-sky-50 border border-sky-100/60 text-sky-500 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5 shadow-3xs" title="Document/Link available">
                                              📄 Doc
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      
                                      <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100/80 px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-black flex items-center gap-0.5 shadow-3xs">
                                        📖 Study
                                      </span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Premium Content Viewer Modal */}
      {activeTopic && (
        <TopicContentViewer
          topic={activeTopic}
          onClose={() => setActiveTopic(null)}
          role="student"
        />
      )}
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  )
}

function ChapterStatusDot({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'
  return <div className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />
}

function RadialProgress({ pct, size = 52, strokeWidth = 5 }: { pct: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-slate-100"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-indigo-600 transition-all duration-500 ease-out"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-black text-slate-800">{pct}%</span>
    </div>
  )
}
