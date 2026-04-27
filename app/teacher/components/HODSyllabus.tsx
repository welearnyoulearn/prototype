'use client'

import { useCallback, useEffect, useState } from 'react'

type HODAssignmentItem = {
  id: number
  department: string   // = subject name (Physics, Mathematics, etc.)
  teacher_id: number
  class_ids: number[]
}

type Teacher = { id: number; name: string; school_id: number }

type Props = {
  teacher: Teacher
  hodAssignments: HODAssignmentItem[]
}

type ClassOption = { id: number; grade: string; section: string }

type Topic = {
  id: number
  topic_name: string
  topic_order: number
  status: string
  covered_date: string | null
  covered_by_name: string | null
  target_date: string | null
  delay_reason: string | null
  hod_remark: string | null
  hod_remark_by_name: string | null
  hod_remark_at: string | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  total: number
  covered: number
  behind: number
  topics: Topic[]
}

export default function HODSyllabus({ teacher, hodAssignments }: Props) {
  // ── Subject selector (1d) ─────────────────────────────────────────────────
  // Unique subjects this HOD manages
  const allSubjects = Array.from(new Set(hodAssignments.map(a => a.department).filter(Boolean)))
  const [selectedSubject, setSelectedSubject] = useState<string>(allSubjects[0] ?? '')

  // Class IDs for the currently-selected subject
  const subjectAssignments = hodAssignments.filter(a => a.department === selectedSubject)
  const allClassIds = Array.from(new Set(subjectAssignments.flatMap(a => a.class_ids || [])))

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<number | null>(null)

  // ── Add chapter (1b) ──────────────────────────────────────────────────────
  // "stagedChapter" exists only in local state until the first topic is added.
  // Nothing is written to the DB until the first real topic is submitted.
  const [showAddChapter, setShowAddChapter] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [stagedChapter, setStagedChapter] = useState<string | null>(null) // name only, not in DB yet

  // Add topic per chapter
  const [addTopicChapter, setAddTopicChapter] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicTarget, setNewTopicTarget] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // Inline edit states
  const [editingTarget, setEditingTarget] = useState<number | null>(null)
  const [editingDelay, setEditingDelay] = useState<number | null>(null)
  const [editingRemark, setEditingRemark] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')

  // Reset class selection when subject changes
  useEffect(() => {
    setSelectedClassId(null)
    setClasses([])
    setStagedChapter(null)
    setExpandedChapter(null)
  }, [selectedSubject])

  // Load assigned classes for the selected subject
  useEffect(() => {
    if (!allClassIds.length) return
    fetch(`/api/classes?school_id=${teacher.school_id}`)
      .then(r => r.json())
      .then((data: ClassOption[]) => {
        const filtered = Array.isArray(data)
          ? data.filter(c => allClassIds.includes(c.id))
              .sort((a, b) => {
                const ga = parseInt(a.grade) || 0, gb = parseInt(b.grade) || 0
                return ga !== gb ? ga - gb : a.section.localeCompare(b.section)
              })
          : []
        setClasses(filtered)
        if (filtered.length > 0) setSelectedClassId(prev => prev ?? filtered[0].id)
      })
  }, [teacher.school_id, selectedSubject]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSyllabus = useCallback(async () => {
    if (!selectedClassId || !selectedSubject) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/syllabus?school_id=${teacher.school_id}&class_id=${selectedClassId}&subject=${encodeURIComponent(selectedSubject)}`
      )
      const data = await res.json()
      const today = new Date().toISOString().slice(0, 10)
      const subjectData = data.subjects?.[0]
      if (!subjectData) { setChapters([]); return }
      const processed: Chapter[] = subjectData.chapters.map((ch: Chapter) => {
        let behind = 0
        const topics = ch.topics.map((t: Topic) => {
          if (t.status !== 'covered' && t.target_date && t.target_date < today) behind++
          return t
        })
        return { ...ch, topics, behind }
      })
      setChapters(processed)
    } catch {
      setError('Failed to load syllabus')
    } finally {
      setLoading(false)
    }
  }, [selectedClassId, selectedSubject, teacher.school_id])

  useEffect(() => { loadSyllabus() }, [loadSyllabus])

  async function patchTopic(id: number, payload: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/syllabus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: teacher.school_id, ...payload }),
      })
      if (!res.ok) throw new Error()
      await loadSyllabus()
    } catch { setError('Failed to save') }
    finally { setSaving(null) }
  }

  // Stage a new chapter locally — no DB write yet (1b)
  function stageChapter() {
    const name = newChapterName.trim()
    if (!name) return
    // Check not duplicate with existing chapters
    if (chapters.some(c => c.chapter_name.toLowerCase() === name.toLowerCase())) {
      setError(`Chapter "${name}" already exists`)
      return
    }
    setStagedChapter(name)
    setNewChapterName('')
    setShowAddChapter(false)
    setExpandedChapter(name)
    setAddTopicChapter(name)  // immediately open add-topic form
  }

  // Add topic — if chapter is staged (not in DB yet), first topic call creates both (1b)
  // Also enforces no duplicate topic names in the same chapter (1c)
  async function addTopic() {
    if (!selectedClassId || !addTopicChapter || !newTopicName.trim()) return

    const topicNameTrimmed = newTopicName.trim()

    // 1c: Client-side duplicate check
    const existingChapter = chapters.find(c => c.chapter_name === addTopicChapter)
    if (existingChapter) {
      const isDuplicate = existingChapter.topics.some(
        t => t.topic_name.toLowerCase() === topicNameTrimmed.toLowerCase()
      )
      if (isDuplicate) {
        setError(`Topic "${topicNameTrimmed}" already exists in this chapter`)
        return
      }
    }

    setAddingTopic(true)
    const isStagedChapter = addTopicChapter === stagedChapter
    const chapterOrder = isStagedChapter
      ? chapters.length + 1
      : (chapters.find(c => c.chapter_name === addTopicChapter)?.chapter_order ?? chapters.length + 1)
    const topicOrder = existingChapter ? existingChapter.topics.length + 1 : 1

    try {
      const res = await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: teacher.school_id,
          class_id: selectedClassId,
          subject: selectedSubject,
          chapter_name: addTopicChapter,
          chapter_order: chapterOrder,
          topic_name: topicNameTrimmed,
          topic_order: topicOrder,
          target_date: newTopicTarget || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed')
      }
      setNewTopicName('')
      setNewTopicTarget('')
      setAddTopicChapter(null)
      if (isStagedChapter) setStagedChapter(null) // chapter is now persisted
      setExpandedChapter(addTopicChapter)
      await loadSyllabus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add topic')
    } finally {
      setAddingTopic(false)
    }
  }

  function cancelStagedChapter() {
    setStagedChapter(null)
    setAddTopicChapter(null)
    setNewTopicName('')
    setNewTopicTarget('')
  }

  async function deleteTopic(id: number) {
    await fetch(`/api/syllabus/${id}?school_id=${teacher.school_id}`, { method: 'DELETE' })
    await loadSyllabus()
  }

  const today = new Date().toISOString().slice(0, 10)
  const totalTopics   = chapters.reduce((s, c) => s + c.total, 0)
  const coveredTopics = chapters.reduce((s, c) => s + c.covered, 0)
  const behindTopics  = chapters.reduce((s, c) => s + c.behind, 0)

  // Combine persisted chapters + staged chapter for rendering
  const visibleChapters: (Chapter | { chapter_name: string; chapter_order: number; total: 0; covered: 0; behind: 0; topics: []; staged: true })[] =
    stagedChapter
      ? [...chapters, { chapter_name: stagedChapter, chapter_order: chapters.length + 1, total: 0, covered: 0, behind: 0, topics: [], staged: true }]
      : chapters

  if (!allClassIds.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-amber-700 font-medium">No classes assigned yet.</p>
        <p className="text-amber-500 text-sm mt-1">Ask the school admin to assign classes to your HOD profile.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">HOD</span>
            <h2 className="font-bold text-gray-900 text-xl">Syllabus Management</h2>
          </div>
          {/* 1d: Subject pill selector */}
          {allSubjects.length === 1 ? (
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
              {selectedSubject}
            </span>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {allSubjects.map(subj => (
                <button key={subj} onClick={() => setSelectedSubject(subj)}
                  className={`text-sm font-semibold px-3 py-1 rounded-full border transition-colors ${
                    selectedSubject === subj
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}>
                  {subj}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowAddChapter(v => !v); setNewChapterName('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Chapter
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
          {error}<button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Class selector */}
      {classes.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {classes.map(c => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                selectedClassId === c.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}>
              Grade {c.grade}-{c.section}
            </button>
          ))}
        </div>
      )}
      {classes.length === 1 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-400">Class:</span>
          <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
            Grade {classes[0].grade}-{classes[0].section}
          </span>
        </div>
      )}

      {/* Stats */}
      {totalTopics > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Topics', value: totalTopics, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
            { label: 'Covered', value: coveredTopics, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Behind Schedule', value: behindTopics, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3 text-center`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add chapter form */}
      {showAddChapter && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 mb-3">New Chapter</p>
          <div className="flex gap-2">
            <input
              value={newChapterName}
              onChange={e => setNewChapterName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && stageChapter()}
              placeholder="Chapter name, e.g. Quadratic Equations"
              autoFocus
              className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button onClick={stageChapter} disabled={!newChapterName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              Next →
            </button>
            <button onClick={() => { setShowAddChapter(false); setNewChapterName('') }}
              className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
          <p className="text-xs text-blue-500 mt-2">You&apos;ll add topics in the next step</p>
        </div>
      )}

      {/* Syllabus content */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading syllabus...</p>
        </div>
      ) : visibleChapters.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 text-center">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium mb-1">No syllabus yet for this class</p>
          <p className="text-gray-400 text-sm">Click <strong>Add Chapter</strong> to start building the {selectedSubject} syllabus</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleChapters.map((ch, chIdx) => {
            const isStaged = 'staged' in ch && ch.staged === true
            const isExpanded = expandedChapter === ch.chapter_name
            const pct = ch.total > 0 ? Math.round(100 * ch.covered / ch.total) : 0

            return (
              <div key={ch.chapter_name} className={`bg-white rounded-xl border overflow-hidden ${isStaged ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                {/* Chapter header */}
                <button
                  onClick={() => setExpandedChapter(isExpanded ? null : ch.chapter_name)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isStaged ? 'bg-blue-200 text-blue-800' : 'bg-blue-100 text-blue-700'}`}>
                    {chIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{ch.chapter_name}</span>
                      {isStaged && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                          Add topics to save
                        </span>
                      )}
                      {'behind' in ch && ch.behind > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                          {ch.behind} behind
                        </span>
                      )}
                    </div>
                    {!isStaged && (
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 max-w-[140px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'behind' in ch && ch.behind > 0 ? 'bg-red-400' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{ch.covered}/{ch.total} covered</span>
                      </div>
                    )}
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Topics */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {!isStaged && ch.topics.length === 0 && (
                      <p className="px-6 py-3 text-sm text-gray-400 italic">No topics yet — add one below</p>
                    )}

                    {'topics' in ch && ch.topics.map((topic, tIdx) => {
                      const isBehind = topic.status !== 'covered' && topic.target_date && topic.target_date < today
                      const isSaving = saving === topic.id

                      return (
                        <div key={topic.id} className={`px-5 py-3 border-b border-gray-50 last:border-b-0 ${isBehind ? 'bg-red-50/40' : ''}`}>
                          <div className="flex items-start gap-3">
                            {/* Cover toggle */}
                            <button
                              onClick={() => patchTopic(topic.id, {
                                status: topic.status === 'covered' ? 'pending' : 'covered',
                                covered_by: teacher.id,
                              })}
                              disabled={isSaving}
                              title={topic.status === 'covered' ? 'Mark as pending' : 'Mark as covered'}
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                topic.status === 'covered'
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : isBehind ? 'border-red-400 hover:border-red-600'
                                  : 'border-gray-300 hover:border-blue-400'
                              } ${isSaving ? 'opacity-40' : ''}`}>
                              {topic.status === 'covered' && (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gray-300">{tIdx + 1}.</span>
                                <span className={`text-sm font-medium ${topic.status === 'covered' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                  {topic.topic_name}
                                </span>
                                {isBehind && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">Behind</span>}
                                {topic.status === 'covered' && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                    ✓ {topic.covered_date}{topic.covered_by_name ? ` · ${topic.covered_by_name}` : ''}
                                  </span>
                                )}
                              </div>

                              {/* Target date */}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-[10px] text-gray-400">Target:</span>
                                {editingTarget === topic.id ? (
                                  <span className="flex items-center gap-1">
                                    <input type="date" value={editVal} onChange={e => setEditVal(e.target.value)}
                                      className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none" />
                                    <button onClick={async () => { await patchTopic(topic.id, { target_date: editVal || null }); setEditingTarget(null) }}
                                      className="text-xs text-blue-600 font-medium">Save</button>
                                    <button onClick={() => setEditingTarget(null)} className="text-xs text-gray-400">✕</button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { setEditingTarget(topic.id); setEditVal(topic.target_date || '') }}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                      topic.target_date
                                        ? isBehind ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-100'
                                        : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                                    }`}>
                                    {topic.target_date || 'Set date'}
                                  </button>
                                )}

                                {(isBehind || topic.delay_reason) && (
                                  <>
                                    <span className="text-[10px] text-red-400">Delay:</span>
                                    {editingDelay === topic.id ? (
                                      <span className="flex items-center gap-1">
                                        <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                          placeholder="Reason for delay..."
                                          className="border border-red-200 rounded px-1.5 py-0.5 text-xs w-40 focus:outline-none" />
                                        <button onClick={async () => { await patchTopic(topic.id, { delay_reason: editVal }); setEditingDelay(null) }}
                                          className="text-xs text-red-600 font-medium">Save</button>
                                        <button onClick={() => setEditingDelay(null)} className="text-xs text-gray-400">✕</button>
                                      </span>
                                    ) : (
                                      <button onClick={() => { setEditingDelay(topic.id); setEditVal(topic.delay_reason || '') }}
                                        className="text-xs text-red-600 underline decoration-dotted">
                                        {topic.delay_reason || 'Add reason'}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* HOD remark */}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-gray-400">HOD note:</span>
                                {editingRemark === topic.id ? (
                                  <span className="flex items-center gap-1">
                                    <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                      placeholder="Add remark..."
                                      className="border border-amber-200 rounded px-1.5 py-0.5 text-xs w-44 focus:outline-none" />
                                    <button onClick={async () => { await patchTopic(topic.id, { hod_remark: editVal, hod_remark_by: teacher.id }); setEditingRemark(null) }}
                                      className="text-xs text-amber-700 font-medium">Save</button>
                                    <button onClick={() => setEditingRemark(null)} className="text-xs text-gray-400">✕</button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setEditingRemark(topic.id); setEditVal(topic.hod_remark || '') }}
                                    className="text-xs text-amber-700 underline decoration-dotted">
                                    {topic.hod_remark ? `"${topic.hod_remark}"` : 'Add note'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Delete topic */}
                            <button onClick={() => deleteTopic(topic.id)} title="Remove topic"
                              className="text-gray-200 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Add topic form */}
                    {addTopicChapter === ch.chapter_name ? (
                      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                        {isStaged && (
                          <p className="text-xs text-blue-600 font-medium mb-2">
                            Add the first topic — chapter will be saved automatically
                          </p>
                        )}
                        {!isStaged && (
                          <p className="text-xs font-semibold text-gray-600 mb-2">Add Topic to &ldquo;{ch.chapter_name}&rdquo;</p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <input
                            value={newTopicName}
                            onChange={e => setNewTopicName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTopic()}
                            placeholder="Topic name..."
                            autoFocus
                            className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                          <input
                            type="date"
                            value={newTopicTarget}
                            onChange={e => setNewTopicTarget(e.target.value)}
                            title="Target completion date"
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                          <button onClick={addTopic} disabled={addingTopic || !newTopicName.trim()}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                            {addingTopic ? 'Adding...' : 'Add Topic'}
                          </button>
                          <button onClick={() => {
                            if (isStaged) cancelStagedChapter()
                            else { setAddTopicChapter(null); setNewTopicName(''); setNewTopicTarget('') }
                          }}
                            className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-100">
                            {isStaged ? 'Discard chapter' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : !isStaged ? (
                      <button
                        onClick={() => { setAddTopicChapter(ch.chapter_name); setNewTopicName(''); setNewTopicTarget(''); setExpandedChapter(ch.chapter_name) }}
                        className="w-full px-5 py-2.5 text-left text-xs text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5 border-t border-gray-50">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add topic to this chapter
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
