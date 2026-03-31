'use client'

import { useCallback, useEffect, useState } from 'react'

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

type Teacher = {
  id: number
  name: string
  school_id: number
}

type Props = {
  teacher: Teacher
  classId: number
}

type AddForm = {
  subject: string
  chapter_name: string
  chapter_order: string
  topic_name: string
  topic_order: string
}

export default function TeacherSyllabus({ teacher, classId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>({
    subject: '', chapter_name: '', chapter_order: '1', topic_name: '', topic_order: '1'
  })
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const fetchSyllabus = useCallback(async () => {
    const res = await fetch(`/api/syllabus?school_id=${teacher.school_id}&class_id=${classId}`)
    const d = await res.json()
    setSubjects(d.subjects || [])
    setLoading(false)
  }, [teacher.school_id, classId])

  useEffect(() => { fetchSyllabus() }, [fetchSyllabus])

  async function toggleCovered(topic: Topic) {
    setTogglingId(topic.id)
    const newStatus = topic.status === 'covered' ? 'pending' : 'covered'
    try {
      await fetch(`/api/syllabus/${topic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: teacher.school_id,
          status: newStatus,
          covered_by: newStatus === 'covered' ? teacher.id : undefined,
        }),
      })
      await fetchSyllabus()
    } finally {
      setTogglingId(null)
    }
  }

  async function deleteTopic(id: number) {
    if (!confirm('Delete this topic?')) return
    await fetch(`/api/syllabus/${id}?school_id=${teacher.school_id}`, { method: 'DELETE' })
    await fetchSyllabus()
  }

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!addForm.subject || !addForm.chapter_name || !addForm.topic_name) {
      setAddError('Subject, chapter, and topic name are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: teacher.school_id,
          class_id: classId,
          subject: addForm.subject.trim(),
          chapter_name: addForm.chapter_name.trim(),
          chapter_order: parseInt(addForm.chapter_order) || 0,
          topic_name: addForm.topic_name.trim(),
          topic_order: parseInt(addForm.topic_order) || 0,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setAddError(d.error || 'Failed to add topic')
      } else {
        setAddForm({ subject: addForm.subject, chapter_name: addForm.chapter_name, chapter_order: addForm.chapter_order, topic_name: '', topic_order: '' })
        await fetchSyllabus()
      }
    } finally {
      setSaving(false)
    }
  }

  // Deduplicate subjects for the subject dropdown suggestions
  const existingSubjects = subjects.map(s => s.subject)

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800 text-lg">Class Syllabus</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Topic'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
          <h3 className="font-semibold text-indigo-800 mb-4">Add Syllabus Topic</h3>
          <form onSubmit={handleAddTopic} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
                <input
                  list="subjects-list"
                  value={addForm.subject}
                  onChange={e => setAddForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Mathematics"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
                <datalist id="subjects-list">
                  {existingSubjects.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Chapter *</label>
                <input
                  value={addForm.chapter_name}
                  onChange={e => setAddForm(f => ({ ...f, chapter_name: e.target.value }))}
                  placeholder="e.g. Algebra"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Topic Name *</label>
                <input
                  value={addForm.topic_name}
                  onChange={e => setAddForm(f => ({ ...f, topic_name: e.target.value }))}
                  placeholder="e.g. Linear Equations"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
                <input
                  type="number"
                  min={1}
                  value={addForm.topic_order}
                  onChange={e => setAddForm(f => ({ ...f, topic_order: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            {addError && <p className="text-red-600 text-sm">{addError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : 'Add Topic'}
            </button>
          </form>
        </div>
      )}

      {/* Empty state */}
      {subjects.length === 0 && !showAddForm && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📚</p>
          <p className="font-medium text-gray-700">No syllabus topics yet</p>
          <p className="text-sm mt-1">Click &quot;Add Topic&quot; to start building the syllabus for this class.</p>
        </div>
      )}

      {/* Subject accordions */}
      {subjects.map(subj => {
        const isExpanded = expandedSubject === subj.subject
        const pctColor = subj.completion_pct >= 75 ? 'bg-green-500' : subj.completion_pct >= 40 ? 'bg-amber-400' : 'bg-blue-500'

        return (
          <div key={subj.subject} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${pctColor} rounded-full`} style={{ width: `${Math.max(2, subj.completion_pct)}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{subj.covered}/{subj.total} topics covered</p>
              </div>
              <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {subj.chapters.map(ch => {
                  const chKey = `${subj.subject}-${ch.chapter_name}`
                  const chExpanded = expandedChapter === chKey

                  return (
                    <div key={ch.chapter_name}>
                      <button
                        onClick={() => setExpandedChapter(chExpanded ? null : chKey)}
                        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{ch.chapter_name}</span>
                          <span className="text-xs text-gray-500">{ch.covered}/{ch.total} done</span>
                        </div>
                        <span className={`text-gray-300 text-xs transition-transform ${chExpanded ? 'rotate-180' : ''}`}>▼</span>
                      </button>

                      {chExpanded && (
                        <div className="bg-gray-50 px-5 pb-3 space-y-2">
                          {ch.topics.map(topic => (
                            <div key={topic.id} className="flex items-center gap-3 py-1.5">
                              <button
                                onClick={() => toggleCovered(topic)}
                                disabled={togglingId === topic.id}
                                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                                  topic.status === 'covered'
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 bg-white hover:border-green-400'
                                }`}
                              >
                                {topic.status === 'covered' && (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              <span className={`text-sm flex-1 ${topic.status === 'covered' ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                                {topic.topic_name}
                              </span>
                              {topic.covered_date && (
                                <span className="text-xs text-gray-400">
                                  {new Date(topic.covered_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                              <button
                                onClick={() => deleteTopic(topic.id)}
                                className="text-red-300 hover:text-red-500 transition-colors text-xs px-1"
                                title="Delete topic"
                              >
                                ✕
                              </button>
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
