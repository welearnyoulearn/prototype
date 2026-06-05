'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = {
  schoolId: number
}

type Subject = {
  id: number
  school_id: number
  master_subject_id: number | null
  subject_name: string
  board: string | null
  grade: string
  created_at: string
  chapters?: Chapter[]
}

type Chapter = {
  id: number
  school_subject_id: number
  master_chapter_id: number | null
  chapter_name: string
  chapter_order: number
  is_custom: boolean
  created_at: string
  topics?: Topic[]
  tasks?: Task[]
}

type Topic = {
  id: number
  school_chapter_id: number
  master_topic_id: number | null
  topic_name: string
  topic_order: number
  content_text: string | null
  content_pdf_url: string | null
  is_custom: boolean
  created_at: string
  resources?: Resource[]
}

type Resource = {
  id: number
  school_topic_id: number
  master_resource_id: number | null
  resource_type: string
  title: string
  url: string
  is_custom: boolean
  created_at: string
}

type Task = {
  id: number
  school_chapter_id: number
  school_topic_id: number | null
  master_task_id: number | null
  title: string
  instructions: string | null
  task_type: string
  max_marks: number
  is_mandatory: boolean
  is_active: boolean
  is_custom: boolean
  created_at: string
}

type MasterSubject = {
  id: number
  board: string
  grade: string
  subject_name: string
}

export default function CurriculumCustomizer({ schoolId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Academic Years state
  const [academicYears, setAcademicYears] = useState<{ id: number; label: string; is_current: boolean }[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [subscribeYear, setSubscribeYear] = useState<string>('')
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({})

  // Classes state for section mapping
  const [classes, setClasses] = useState<{ id: number; grade: string; section: string }[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([])

  // Modals and form state
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  const [masterSubjects, setMasterSubjects] = useState<MasterSubject[]>([])
  const [subscribing, setSubscribing] = useState(false)
  const [selectedMasterId, setSelectedMasterId] = useState<string>('')
  const [filterBoard, setFilterBoard] = useState('CBSE')
  const [filterGrade, setFilterGrade] = useState('10')

  // Chapter Creation
  const [showAddChapterForm, setShowAddChapterForm] = useState<number | null>(null) // maps to subjectId
  const [newChapterName, setNewChapterName] = useState('')

  // Chapter Editing
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null)
  const [editingChapterName, setEditingChapterName] = useState('')

  // Topic Creation / Editing Modal
  const [topicModalState, setTopicModalState] = useState<{
    show: boolean
    mode: 'create' | 'edit'
    chapterId: number
    topicId?: number
  } | null>(null)
  const [topicForm, setTopicForm] = useState({
    topic_name: '',
    content_text: '',
    content_pdf_url: '',
    resources: [] as { id?: number; resource_type: string; title: string; url: string }[]
  })
  const [newResource, setNewResource] = useState({ resource_type: 'video', title: '', url: '' })

  // Task Creation / Editing Modal
  const [taskModalState, setTaskModalState] = useState<{
    show: boolean
    mode: 'create' | 'edit'
    chapterId: number
    taskId?: number
  } | null>(null)
  const [taskForm, setTaskForm] = useState({
    title: '',
    instructions: '',
    task_type: 'homework',
    max_marks: 10,
    school_topic_id: ''
  })

  // Load school subscribed subjects
  const loadSchoolSubjects = useCallback(async (selectIdAfterLoad?: number, yearOverride?: string) => {
    setLoading(true)
    setError('')
    try {
      const activeYear = yearOverride || selectedYear
      const yearParam = activeYear ? `&academic_year=${activeYear}` : ''
      const res = await fetch(`/api/school/subjects?school_id=${schoolId}&include_details=true${yearParam}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = data.subjects || []
      setSubjects(list)

      if (list.length > 0) {
        if (selectIdAfterLoad) {
          const found = list.find((s: Subject) => s.id === selectIdAfterLoad)
          if (found) setActiveSubject(found)
        } else if (activeSubject) {
          const current = list.find((s: Subject) => s.id === activeSubject.id)
          setActiveSubject(current || list[0])
        } else {
          setActiveSubject(list[0])
        }
      } else {
        setActiveSubject(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load school curriculum')
    } finally {
      setLoading(false)
    }
  }, [schoolId, activeSubject?.id, selectedYear])

  // Fetch academic years on mount
  useEffect(() => {
    fetch(`/api/academic-years?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAcademicYears(data)
          const current = data.find(y => y.is_current)
          const defaultYear = current ? current.label : (data[0]?.label || '2025-26')
          setSelectedYear(defaultYear)
          setSubscribeYear(defaultYear)
          loadSchoolSubjects(undefined, defaultYear)
        } else {
          loadSchoolSubjects()
        }
      })
      .catch(() => {
        loadSchoolSubjects()
      })
  }, [schoolId])

  // Automatically expand the grade accordion for the active subject
  useEffect(() => {
    if (activeSubject) {
      setExpandedGrades(prev => ({
        ...prev,
        [activeSubject.grade]: true
      }))
    }
  }, [activeSubject?.id])

  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    loadSchoolSubjects(undefined, year)
  }

  const toggleGrade = (grade: string) => {
    setExpandedGrades(prev => ({
      ...prev,
      [grade]: !prev[grade]
    }))
  }

  // Load master templates for opt-in subscription
  const loadMasterTemplates = async () => {
    try {
      const res = await fetch(`/api/platform/subjects?board=${filterBoard}&grade=${filterGrade}`)
      const data = await res.json()
      if (res.ok) {
        setMasterSubjects(data.subjects || data)
      }
    } catch {
      // quiet
    }
  }

  // Load school classes on mount
  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setClasses(data)
        }
      })
      .catch(() => {})
  }, [schoolId])

  // Automatically select all sections for the chosen grade when opening modal or changing grade
  useEffect(() => {
    if (showSubscribeModal) {
      const matching = classes.filter(c => c.grade.toString().trim().toLowerCase() === filterGrade.toString().trim().toLowerCase())
      setSelectedClassIds(matching.map(c => c.id))
    } else {
      setSelectedClassIds([])
    }
  }, [filterGrade, showSubscribeModal, classes])

  useEffect(() => {
    if (showSubscribeModal) {
      loadMasterTemplates()
    }
  }, [showSubscribeModal, filterBoard, filterGrade])

  const handleSubscribe = async () => {
    if (!selectedMasterId) return
    setSubscribing(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/school/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          master_subject_id: parseInt(selectedMasterId),
          academic_year: subscribeYear || selectedYear,
          class_ids: selectedClassIds
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Successfully subscribed and cloned curriculum!')
      setShowSubscribeModal(false)
      setSelectedMasterId('')
      // Load and set active to new subject
      await loadSchoolSubjects(data.school_subject_id, subscribeYear || selectedYear)
    } catch (err: any) {
      setError(err.message || 'Failed to subscribe to subject')
    } finally {
      setSubscribing(false)
    }
  }

  // --- Chapter Operations ---

  const handleAddChapter = async (subjectId: number) => {
    if (!newChapterName.trim()) return
    setError('')
    setSuccess('')
    try {
      const existingCount = activeSubject?.chapters?.length || 0
      const res = await fetch('/api/school/custom/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_subject_id: subjectId,
          chapter_name: newChapterName.trim(),
          chapter_order: existingCount + 1
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Custom chapter added successfully!')
      setNewChapterName('')
      setShowAddChapterForm(null)
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to add custom chapter')
    }
  }

  const handleStartEditChapter = (chapter: Chapter) => {
    setEditingChapterId(chapter.id)
    setEditingChapterName(chapter.chapter_name)
  }

  const handleSaveEditChapter = async (chapter: Chapter) => {
    if (!editingChapterName.trim()) return
    setError('')
    try {
      const res = await fetch('/api/school/custom/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chapter.id,
          school_subject_id: chapter.school_subject_id,
          chapter_name: editingChapterName.trim(),
          chapter_order: chapter.chapter_order
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Chapter updated successfully!')
      setEditingChapterId(null)
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to rename chapter')
    }
  }

  const handleDeleteChapter = async (chapter: Chapter) => {
    if (!confirm(`Are you sure you want to delete the custom chapter "${chapter.chapter_name}"?\nAll custom topics and custom tasks under it will be deleted.`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/chapters?id=${chapter.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Custom chapter deleted')
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to delete chapter')
    }
  }

  // --- Topic Operations ---

  const handleOpenAddTopic = (chapterId: number) => {
    setTopicForm({
      topic_name: '',
      content_text: '',
      content_pdf_url: '',
      resources: []
    })
    setTopicModalState({
      show: true,
      mode: 'create',
      chapterId
    })
  }

  const handleOpenEditTopic = (chapterId: number, topic: Topic) => {
    setTopicForm({
      topic_name: topic.topic_name,
      content_text: topic.content_text || '',
      content_pdf_url: topic.content_pdf_url || '',
      resources: topic.resources ? topic.resources.map(r => ({
        id: r.id,
        resource_type: r.resource_type,
        title: r.title,
        url: r.url
      })) : []
    })
    setTopicModalState({
      show: true,
      mode: 'edit',
      chapterId,
      topicId: topic.id
    })
  }

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topicModalState || !topicForm.topic_name.trim()) return
    setError('')
    setSuccess('')

    const payload = {
      id: topicModalState.mode === 'edit' ? topicModalState.topicId : undefined,
      school_chapter_id: topicModalState.chapterId,
      topic_name: topicForm.topic_name.trim(),
      content_text: topicForm.content_text.trim(),
      content_pdf_url: topicForm.content_pdf_url.trim(),
      resources: topicForm.resources
    }

    try {
      const res = await fetch('/api/school/custom/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(topicModalState.mode === 'edit' ? '✓ Custom topic updated' : '✓ Custom topic created!')
      setTopicModalState(null)
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to save topic')
    }
  }

  const handleDeleteTopic = async (topic: Topic) => {
    if (!confirm(`Delete custom topic "${topic.topic_name}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/topics?id=${topic.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Custom topic deleted')
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to delete topic')
    }
  }

  const handleAddResourceItem = () => {
    if (!newResource.title.trim() || !newResource.url.trim()) return
    setTopicForm(prev => ({
      ...prev,
      resources: [...prev.resources, { ...newResource }]
    }))
    setNewResource({ resource_type: 'video', title: '', url: '' })
  }

  const handleRemoveResourceItem = (idx: number) => {
    setTopicForm(prev => ({
      ...prev,
      resources: prev.resources.filter((_, i) => i !== idx)
    }))
  }

  // --- Task Operations ---

  const handleToggleTaskActive = async (task: Task) => {
    if (task.is_mandatory) return
    setError('')
    try {
      const res = await fetch(`/api/school/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !task.is_active })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to toggle task active status')
    }
  }

  const handleOpenAddTask = (chapterId: number) => {
    setTaskForm({
      title: '',
      instructions: '',
      task_type: 'homework',
      max_marks: 10,
      school_topic_id: ''
    })
    setTaskModalState({
      show: true,
      mode: 'create',
      chapterId
    })
  }

  const handleOpenEditTask = (chapterId: number, task: Task) => {
    setTaskForm({
      title: task.title,
      instructions: task.instructions || '',
      task_type: task.task_type || 'homework',
      max_marks: task.max_marks || 10,
      school_topic_id: task.school_topic_id ? String(task.school_topic_id) : ''
    })
    setTaskModalState({
      show: true,
      mode: 'edit',
      chapterId,
      taskId: task.id
    })
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskModalState || !taskForm.title.trim()) return
    setError('')
    setSuccess('')

    const payload = {
      id: taskModalState.mode === 'edit' ? taskModalState.taskId : undefined,
      school_chapter_id: taskModalState.chapterId,
      school_topic_id: taskForm.school_topic_id ? parseInt(taskForm.school_topic_id) : null,
      title: taskForm.title.trim(),
      instructions: taskForm.instructions.trim(),
      task_type: taskForm.task_type,
      max_marks: taskForm.max_marks
    }

    try {
      const res = await fetch('/api/school/custom/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(taskModalState.mode === 'edit' ? '✓ Custom task updated' : '✓ Custom task added!')
      setTaskModalState(null)
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to save task')
    }
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete custom task "${task.title}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/tasks?id=${task.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('✓ Custom task deleted')
      await loadSchoolSubjects()
    } catch (err: any) {
      setError(err.message || 'Failed to delete task')
    }
  }

  return (
    <div className="space-y-6">
      {/* Subject Header / Action Group */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span>📚</span> Syllabus Customizer & Custom Tasks
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Subscribe to Master templates, toggle optional exercises, and insert custom local school chapters/assignments.
          </p>
        </div>
        <button
          onClick={() => setShowSubscribeModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4.5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
        >
          <span>✨</span> Subscribe to Board Subject
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex justify-between items-center text-xs">
          <span className="font-semibold">⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex justify-between items-center text-xs">
          <span className="font-semibold">✓ {success}</span>
          <button onClick={() => setSuccess('')} className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl py-24 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-slate-100" />
            <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute inset-0" />
          </div>
          <p className="text-xs text-slate-400 font-semibold animate-pulse">Loading curriculum overrides...</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-24 text-center">
          <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📓</span>
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No Active Syllabus Subscriptions</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
            Your school hasn&apos;t subscribed to any global board subjects yet. Subscribe to CBSE/SSC templates to customize your classes.
          </p>
          <button
            onClick={() => setShowSubscribeModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
          >
            Choose & Subscribe to Subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Active Subscribed Subjects Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Academic Year Selector Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Academic Service Year
              </label>
              <select
                value={selectedYear}
                onChange={e => handleYearChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {academicYears.map(y => (
                  <option key={y.id} value={y.label}>
                    {y.label} {y.is_current ? '• Active' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Accordion List */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <h3 className="text-2xs font-extrabold text-slate-400 uppercase tracking-wider mb-4">
                Subscribed Subjects ({subjects.length})
              </h3>
              <div className="space-y-2">
                {(() => {
                  const groupedSubjects = subjects.reduce((acc, s) => {
                    const g = s.grade
                    if (!acc[g]) acc[g] = []
                    acc[g].push(s)
                    return acc
                  }, {} as Record<string, Subject[]>)

                  const sortedGrades = Object.keys(groupedSubjects).sort((a, b) => {
                    const na = parseInt(a) || 0
                    const nb = parseInt(b) || 0
                    return na - nb
                  })

                  return sortedGrades.map(grade => {
                    const gradeSubjects = groupedSubjects[grade] || []
                    const isExpanded = expandedGrades[grade]
                    return (
                      <div key={grade} className="border border-slate-100 rounded-xl overflow-hidden">
                        {/* Accordion Header */}
                        <button
                          onClick={() => toggleGrade(grade)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-colors ${
                            isExpanded
                              ? 'bg-slate-50/80 text-slate-800'
                              : 'bg-transparent text-slate-600 hover:bg-slate-50/50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🏫</span> Grade {grade}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>

                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="p-1.5 bg-white border-t border-slate-100 space-y-1">
                            {gradeSubjects.map(s => {
                              const isActive = activeSubject?.id === s.id
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    setActiveSubject(s)
                                    setEditingChapterId(null)
                                    setShowAddChapterForm(null)
                                  }}
                                  className={`w-full text-left p-2.5 rounded-lg transition-all border text-xs flex flex-col gap-1 ${
                                    isActive
                                      ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 font-semibold shadow-sm'
                                      : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50/80'
                                  }`}
                                >
                                  <span className="font-bold truncate">{s.subject_name}</span>
                                  <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                                    <span>🏛️ {s.board || 'Custom'}</span>
                                    <span>·</span>
                                    <span>{s.chapters?.length || 0} chapters</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            {/* Quick Helper Tips */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-700 mb-1 flex items-center gap-1">
                <span>💡</span> Inheritance Rules
              </p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Board mandated subjects, chapters, and topics are locked 🔒 (cannot be deleted or renamed).</li>
                <li>You can add custom local chapters or topics in between them.</li>
                <li>Mandatory tasks are locked, but optional master exercises can be deactivated for your teachers using the toggles.</li>
              </ul>
            </div>
          </div>

          {/* Main Override Workspace */}
          <div className="lg:col-span-3 space-y-6">
            {activeSubject && (
              <>
                {/* Active Subscribed Subject Summary Card */}
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/20 px-2 py-0.5 rounded-full">
                          {activeSubject.board || 'Local School'} Template
                        </span>
                        <span className="text-[10px] font-extrabold uppercase bg-white/10 text-white px-2 py-0.5 rounded-full">
                          Grade {activeSubject.grade}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black mt-3 text-white tracking-tight">{activeSubject.subject_name}</h2>
                      <p className="text-xs text-indigo-200 mt-1">
                        Subscribed: {new Date(activeSubject.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setShowAddChapterForm(activeSubject.id)}
                        className="bg-white text-indigo-950 hover:bg-slate-100 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md self-start"
                      >
                        + Add Custom Chapter
                      </button>
                    </div>
                  </div>

                  {/* Add Chapter Inline form */}
                  {showAddChapterForm === activeSubject.id && (
                    <div className="mt-5 pt-5 border-t border-white/10 flex gap-2 items-center bg-white/5 p-4 rounded-xl">
                      <input
                        type="text"
                        placeholder="Chapter Title (e.g. Unit 6: Practical Lab Exercises)"
                        value={newChapterName}
                        onChange={e => setNewChapterName(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddChapter(activeSubject.id)}
                        disabled={!newChapterName.trim()}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAddChapterForm(null)
                          setNewChapterName('')
                        }}
                        className="text-xs text-slate-300 hover:text-white px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Chapter tree list */}
                {(!activeSubject.chapters || activeSubject.chapters.length === 0) ? (
                  <div className="bg-white border border-slate-200/80 rounded-2xl py-12 text-center text-slate-500 text-xs shadow-sm">
                    No chapters exist for this subject. Create a custom chapter to get started.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeSubject.chapters
                      .sort((a, b) => a.chapter_order - b.chapter_order)
                      .map((ch, chIdx) => {
                        const isEditingCh = editingChapterId === ch.id

                        return (
                          <div key={ch.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                            
                            {/* Chapter Header */}
                            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                                  {chIdx + 1}
                                </div>
                                {isEditingCh ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingChapterName}
                                      onChange={e => setEditingChapterName(e.target.value)}
                                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSaveEditChapter(ch)}
                                      className="text-xs bg-emerald-600 text-white px-2 py-1 rounded"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingChapterId(null)}
                                      className="text-xs text-slate-500 px-1"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-black text-slate-800 text-sm">{ch.chapter_name}</h3>
                                      {ch.is_custom ? (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">
                                          Custom School Chapter
                                        </span>
                                      ) : (
                                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                                          <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                          </svg>
                                          Locked Chapter
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Chapter Order: {ch.chapter_order}</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleStartEditChapter(ch)}
                                    className="text-slate-400 hover:text-slate-600 p-1"
                                    title="Rename Chapter"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  {ch.is_custom ? (
                                    <button
                                      onClick={() => handleDeleteChapter(ch)}
                                      className="text-slate-400 hover:text-red-500 p-1"
                                      title="Delete Chapter"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded-lg" title="Mandatory Chapter cannot be deleted">
                                      🔒 Board Chapter
                                    </span>
                                  )}
                                </div>

                                <button
                                  onClick={() => handleOpenAddTopic(ch.id)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ml-2"
                                >
                                  + Custom Topic
                                </button>
                                <button
                                  onClick={() => handleOpenAddTask(ch.id)}
                                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  + Custom Task
                                </button>
                              </div>
                            </div>

                            {/* Topics list & Tasks list inside chapter */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              
                              {/* Topics Area */}
                              <div className="space-y-2.5">
                                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pb-1">
                                  <span>📝</span> Topics in this Chapter
                                </h4>

                                {(!ch.topics || ch.topics.length === 0) ? (
                                  <div className="text-[11px] text-slate-400 italic py-2">No topics. Add custom topics above.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {ch.topics
                                      .sort((a, b) => a.topic_order - b.topic_order)
                                      .map(topic => (
                                        <div key={topic.id} className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-1">
                                          <div className="flex items-start justify-between gap-2">
                                            <div>
                                              <p className="text-xs font-bold text-slate-700">
                                                {topic.topic_order}. {topic.topic_name}
                                              </p>
                                              {topic.is_custom ? (
                                                <span className="text-[8px] bg-emerald-100 text-emerald-800 font-extrabold px-1 rounded">
                                                  Custom School Override
                                                </span>
                                              ) : (
                                                <span className="text-[8px] bg-amber-100 text-amber-800 font-extrabold px-1 rounded">
                                                  🔒 Mandated
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex gap-1 items-center">
                                              <button
                                                onClick={() => handleOpenEditTopic(ch.id, topic)}
                                                className="text-slate-400 hover:text-slate-600 text-xs p-0.5"
                                                title="Edit Topic Content"
                                              >
                                                ✎
                                              </button>
                                              {topic.is_custom ? (
                                                <button
                                                  onClick={() => handleDeleteTopic(topic)}
                                                  className="text-slate-400 hover:text-red-500 text-xs p-0.5"
                                                  title="Delete Topic"
                                                >
                                                  ✕
                                                </button>
                                              ) : (
                                                <span className="text-[9px] text-slate-400" title="Board topic cannot be deleted">🔒</span>
                                              )}
                                            </div>
                                          </div>

                                          {topic.content_text && (
                                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{topic.content_text}</p>
                                          )}

                                          {topic.content_pdf_url && (
                                            <p className="text-[9px] text-indigo-600 font-semibold truncate mt-1">
                                              📄 PDF Link: <a href={topic.content_pdf_url} target="_blank" rel="noreferrer" className="underline">{topic.content_pdf_url}</a>
                                            </p>
                                          )}

                                          {/* Resources list inside topic */}
                                          {topic.resources && topic.resources.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                              {topic.resources.map(res => (
                                                <span
                                                  key={res.id}
                                                  className="text-[8px] bg-slate-200/50 text-slate-600 border border-slate-300 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]"
                                                  title={`${res.title} (${res.resource_type})`}
                                                >
                                                  {res.resource_type === 'video' ? '📺' : '🔗'} {res.title}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>

                              {/* Exercises & Tasks Area */}
                              <div className="space-y-2.5">
                                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pb-1">
                                  <span>🎯</span> Exercises & Homework Tasks
                                </h4>

                                {(!ch.tasks || ch.tasks.length === 0) ? (
                                  <div className="text-[11px] text-slate-400 italic py-2">No tasks assigned. Click Custom Task to add.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {ch.tasks.map(task => {
                                      const mappedTopic = ch.topics?.find(t => t.id === task.school_topic_id)
                                      
                                      return (
                                        <div
                                          key={task.id}
                                          className={`border rounded-xl p-3 flex flex-col gap-1 transition-all ${
                                            task.is_active
                                              ? 'bg-slate-50 border-slate-200/60'
                                              : 'bg-slate-100/60 border-slate-200/30 opacity-60'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <p className={`text-xs font-bold ${task.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                                  {task.title}
                                                </p>
                                                {task.is_custom ? (
                                                  <span className="bg-emerald-100 text-emerald-800 text-[8px] font-extrabold px-1 rounded uppercase">
                                                    Custom
                                                  </span>
                                                ) : task.is_mandatory ? (
                                                  <span className="bg-red-50 text-red-700 border border-red-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                                                    🔒 Mandated
                                                  </span>
                                                ) : (
                                                  <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">
                                                    Board Optional
                                                  </span>
                                                )}
                                              </div>
                                              {mappedTopic && (
                                                <p className="text-[8.5px] text-slate-400 mt-0.5">
                                                  Linked topic: <span className="font-semibold">{mappedTopic.topic_name}</span>
                                                </p>
                                              )}
                                            </div>

                                            {/* Action Control: Mandatory exercises cannot be toggled or deleted. Optional can be toggled. Custom can be edited/deleted. */}
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => handleOpenEditTask(ch.id, task)}
                                                className="text-slate-400 hover:text-slate-600 text-xs p-0.5"
                                                title="Edit Task"
                                              >
                                                ✎
                                              </button>
                                              {task.is_custom ? (
                                                <button
                                                  onClick={() => handleDeleteTask(task)}
                                                  className="text-slate-400 hover:text-red-500 text-xs p-0.5"
                                                  title="Delete Task"
                                                >
                                                  ✕
                                                </button>
                                              ) : !task.is_mandatory ? (
                                                <div className="flex items-center gap-1.5">
                                                  <label className="relative inline-flex items-center cursor-pointer scale-90" title={task.is_active ? 'Deactivate Task' : 'Activate Task'}>
                                                    <input
                                                      type="checkbox"
                                                      checked={task.is_active}
                                                      onChange={() => handleToggleTaskActive(task)}
                                                      className="sr-only peer"
                                                    />
                                                    <div className="w-7 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                                                  </label>
                                                </div>
                                              ) : (
                                                <span className="text-[9px] text-slate-400 font-semibold" title="Mandatory Curriculum Requirement">
                                                  🔒 Required
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {task.instructions && (
                                            <p className={`text-[10px] mt-1 leading-relaxed ${task.is_active ? 'text-slate-500' : 'text-slate-400 line-through'}`}>
                                              {task.instructions}
                                            </p>
                                          )}

                                          <div className="flex gap-2.5 mt-2 text-[9px] text-slate-400 font-medium">
                                            <span className="bg-slate-200/50 px-1.5 py-0.5 rounded capitalize">{task.task_type}</span>
                                            <span>Max Marks: {task.max_marks}</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>

                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}

      {/* ── MODALS ── */}

      {/* Subscribe Master Modal */}
      {showSubscribeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <button onClick={() => setShowSubscribeModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            
            <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
              <span>🏛️</span> Subscribe to Board Curriculum Templates
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Select an academic board and grade level, choose a master subject template, and clone it instantly into your school workspace.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Academic Board</label>
                <select
                  value={filterBoard}
                  onChange={e => setFilterBoard(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="CBSE">CBSE (Central Board)</option>
                  <option value="AP_SSC">AP SSC (Andhra Pradesh)</option>
                  <option value="TS_SSC">TS SSC (Telangana)</option>
                </select>
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Grade Level</label>
                <select
                  value={filterGrade}
                  onChange={e => setFilterGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="6">Grade 6</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                  <option value="10">Grade 10</option>
                </select>
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Target Year</label>
                <select
                  value={subscribeYear}
                  onChange={e => setSubscribeYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {academicYears.map(y => (
                    <option key={y.id} value={y.label}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sections Selector */}
            <div className="mb-5 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
              <label className="block text-2xs font-black text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <span>🏫</span> Assign to Class Sections (Grade {filterGrade})
              </label>
              {classes.filter(c => c.grade.toString().trim() === filterGrade.toString().trim()).length === 0 ? (
                <p className="text-2xs text-slate-400 italic">
                  No sections found in database for Grade {filterGrade}.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {classes
                    .filter(c => c.grade.toString().trim() === filterGrade.toString().trim())
                    .map(cls => {
                      const isChecked = selectedClassIds.includes(cls.id)
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => {
                            setSelectedClassIds(prev =>
                              isChecked ? prev.filter(id => id !== cls.id) : [...prev, cls.id]
                            )
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                            isChecked
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className={`rounded border-slate-300 transition-colors ${
                              isChecked ? 'accent-white text-indigo-600' : 'accent-indigo-600'
                            }`}
                          />
                          <span>Section {cls.section}</span>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>

            <div className="space-y-2 mb-6">
              <label className="block text-2xs font-bold text-slate-500 uppercase tracking-wider">Select Available Template Subject *</label>
              
              {masterSubjects.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-slate-100">
                  No subjects found. Create subjects in Platform Master builder first.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {masterSubjects.map(sub => {
                    const alreadySubscribed = subjects.some(
                      s => s.master_subject_id === sub.id || (s.subject_name.toLowerCase() === sub.subject_name.toLowerCase() && s.grade === sub.grade)
                    )

                    return (
                      <label
                        key={sub.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          alreadySubscribed
                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed text-slate-400'
                            : selectedMasterId === String(sub.id)
                            ? 'border-indigo-400 bg-indigo-50/40 text-indigo-900 font-semibold'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="masterSubject"
                            value={sub.id}
                            disabled={alreadySubscribed}
                            checked={selectedMasterId === String(sub.id)}
                            onChange={() => setSelectedMasterId(String(sub.id))}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <div>
                            <p className="text-xs font-bold">{sub.subject_name}</p>
                            <p className="text-3xs uppercase tracking-widest text-slate-400 mt-0.5">{sub.board} · Grade {sub.grade}</p>
                          </div>
                        </div>
                        {alreadySubscribed && (
                          <span className="text-[9px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                            Subscribed
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSubscribeModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={subscribing || !selectedMasterId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-md"
              >
                {subscribing ? 'Cloning Syllabus...' : 'Subscribe & Clone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Topic Modal */}
      {topicModalState?.show && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl my-8">
            <button onClick={() => setTopicModalState(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            
            <h3 className="text-base font-black text-slate-800 mb-2">
              {topicModalState.mode === 'edit' ? '✎ Edit Custom Topic' : '📝 Create Custom Topic'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Add direct syllabus reading content, textbook PDF link, and digital reference assets.
            </p>

            <form onSubmit={handleSaveTopic} className="space-y-4">
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Topic Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Practical Lab Activity 1"
                  required
                  value={topicForm.topic_name}
                  onChange={e => setTopicForm(prev => ({ ...prev, topic_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Study Content (Text)</label>
                <textarea
                  placeholder="Direct lesson content/instructions for teachers..."
                  rows={4}
                  value={topicForm.content_text}
                  onChange={e => setTopicForm(prev => ({ ...prev, content_text: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Textbook PDF Link Reference</label>
                <input
                  type="url"
                  placeholder="https://example.com/custom-materials.pdf"
                  value={topicForm.content_pdf_url}
                  onChange={e => setTopicForm(prev => ({ ...prev, content_pdf_url: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Resources builder inside Topic Form */}
              <div className="border-t border-slate-100 pt-3">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Media & Attachments</h4>
                
                {topicForm.resources.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {topicForm.resources.map((res, rIdx) => (
                      <div key={rIdx} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-lg text-xs">
                        <span className="truncate font-semibold text-slate-700">
                          {res.resource_type === 'video' ? '📺' : '🔗'} {res.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveResourceItem(rIdx)}
                          className="text-red-500 hover:text-red-700 text-xs px-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-1">
                    <select
                      value={newResource.resource_type}
                      onChange={e => setNewResource(prev => ({ ...prev, resource_type: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                    >
                      <option value="video">Video</option>
                      <option value="gdoc">Google Doc</option>
                      <option value="pdf">PDF Link</option>
                      <option value="url">Other Link</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Attachment Title (e.g. Lab Demonstration Link)"
                      value={newResource.title}
                      onChange={e => setNewResource(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://..."
                        value={newResource.url}
                        onChange={e => setNewResource(prev => ({ ...prev, url: e.target.value }))}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddResourceItem}
                        disabled={!newResource.title.trim() || !newResource.url.trim()}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTopicModalState(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
                >
                  Save Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {taskModalState?.show && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
            <button onClick={() => setTaskModalState(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            
            <h3 className="text-base font-black text-slate-800 mb-2">
              {taskModalState.mode === 'edit' ? '✎ Edit Custom Task' : '🎯 Add Custom School Exercise'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Add homework assignments, tests, or worksheets specific to your local classes.
            </p>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Exercise Title *</label>
                <input
                  type="text"
                  placeholder="e.g. End of Unit Written Test"
                  required
                  value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Link to Specific Topic (Optional)</label>
                <select
                  value={taskForm.school_topic_id}
                  onChange={e => setTaskForm(prev => ({ ...prev, school_topic_id: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">— General Chapter Level Task —</option>
                  {activeSubject?.chapters
                    ?.find(c => c.id === taskModalState.chapterId)
                    ?.topics?.map(topic => (
                      <option key={topic.id} value={topic.id}>Topic {topic.topic_order}: {topic.topic_name}</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Task Type</label>
                  <select
                    value={taskForm.task_type}
                    onChange={e => setTaskForm(prev => ({ ...prev, task_type: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="homework">Homework</option>
                    <option value="test">Test</option>
                    <option value="worksheet">Worksheet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Max Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={taskForm.max_marks}
                    onChange={e => setTaskForm(prev => ({ ...prev, max_marks: parseInt(e.target.value) || 10 }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Task Instructions & Description</label>
                <textarea
                  placeholder="Provide instruction steps, study links, or page references for students..."
                  rows={3}
                  value={taskForm.instructions}
                  onChange={e => setTaskForm(prev => ({ ...prev, instructions: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTaskModalState(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
