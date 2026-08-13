'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Plus, Pencil, X, ChevronDown, ChevronRight, HelpCircle,
  Lock, Trash2, Check, FileText, Video, Link as LinkIcon, Quote, Sparkles,
} from 'lucide-react'
import { INK, TEAL, BORDER, SURFACE, GREEN } from '@/app/components/ulearn/theme'
import { QuizPill } from '@/app/components/ulearn/primitives'

type Props = {
  schoolId: number
}

type Question = {
  q: string
  options: string[]
  answer: number
  source?: string
}

type Subject = {
  id: number
  school_id: number
  master_subject_id: number | null
  subject_name: string
  board: string | null
  grade: string
  category?: 'academic' | 'extra'
  created_at: string
  chapters?: Chapter[]
  master_chapter_count?: number
}

type Chapter = {
  id: number
  school_subject_id: number
  master_chapter_id: number | null
  chapter_name: string
  chapter_order: number
  semester?: string | null
  book_type?: string | null
  audience?: string | null
  book_name?: string | null
  is_custom: boolean
  created_at: string
  topics?: Topic[]
  tasks?: Task[]
}

const BOOK_TYPE_LABELS: Record<string, string> = { textbook: 'Text Book', handbook: 'Hand Book', workbook: 'Work Book' }
const AUDIENCE_LABELS: Record<string, string> = { teacher: 'Teacher Edition', both: 'Teacher & Student' }

/** Majority-audience badge for a book tab label — purely cosmetic, never hides anything. */
function audienceBadge(groupChapters: Chapter[]): string | null {
  const counts: Record<string, number> = {}
  for (const c of groupChapters) {
    const a = c.audience || 'student'
    counts[a] = (counts[a] || 0) + 1
  }
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!majority || majority[0] === 'student') return null
  return AUDIENCE_LABELS[majority[0]] || null
}

// A "book" a chapter belongs to is (book_type, book_name) — book_type alone
// can't tell two different Text Books apart. When only one book exists for
// a type, its tab keeps the generic label; once a second book shares that
// type, each gets its own tab labeled with its actual name.
type BookGroup = { key: string; label: string; chapters: Chapter[] }

function bookGroupKey(bookType: string | null | undefined, bookName: string | null | undefined): string {
  return `${bookType || 'textbook'}::${bookName || ''}`
}

function computeBookGroups(chapters: Chapter[]): BookGroup[] {
  const byType = new Map<string, Map<string, Chapter[]>>()
  for (const c of chapters) {
    const bt = c.book_type || 'textbook'
    const bn = c.book_name || ''
    if (!byType.has(bt)) byType.set(bt, new Map())
    const byName = byType.get(bt)!
    if (!byName.has(bn)) byName.set(bn, [])
    byName.get(bn)!.push(c)
  }
  const groups: BookGroup[] = []
  // Fixed order (not Map insertion order, which would depend on whatever
  // order chapters happen to arrive in) so tabs appear the same way here as
  // in the platform-admin curriculum page.
  for (const bt of ['textbook', 'handbook', 'workbook']) {
    const byName = byType.get(bt)
    if (!byName) continue
    const entries = Array.from(byName.entries())
    if (entries.length === 1) {
      const [bn, chs] = entries[0]
      groups.push({ key: bookGroupKey(bt, bn), label: BOOK_TYPE_LABELS[bt] || bt, chapters: chs })
    } else {
      let unnamedCount = 0
      for (const [bn, chs] of entries) {
        if (!bn) {
          unnamedCount += 1
          groups.push({ key: bookGroupKey(bt, bn), label: `${BOOK_TYPE_LABELS[bt] || bt} ${unnamedCount}`, chapters: chs })
        } else {
          groups.push({ key: bookGroupKey(bt, bn), label: bn, chapters: chs })
        }
      }
    }
  }
  return groups
}

type Topic = {
  id: number
  school_chapter_id: number
  master_topic_id: number | null
  topic_name: string
  topic_order: number
  content_text: string | null
  content_pdf_url: string | null
  subtopics?: string[]
  is_custom: boolean
  created_at: string
  resources?: Resource[]
  questions?: Question[]
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

type Material = {
  id: number
  material_type: 'textbook' | 'handbook'
  title: string
  file_url: string
}

const inputCls =
  'w-full bg-white border rounded-xl px-3 py-2 text-sm text-[#0F2A3F] placeholder-gray-400 focus:outline-none focus:ring-2'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

// Matches platform-admin's curriculum page — Extra Subjects are filed under
// this fixed pseudo-board in master_subjects, invisible to the user.
const EXTRA_BOARD = 'EXTRA'

export default function CurriculumCustomizer({ schoolId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null)
  const [activeBookKey, setActiveBookKey] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])

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
  const [resyncing, setResyncing] = useState(false)
  const [selectedMasterId, setSelectedMasterId] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<'academic' | 'extra'>('academic')
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

  // Read-only quiz preview modal (ported from the Ulearn prototype's SchoolView)
  const [viewQuiz, setViewQuiz] = useState<{ topic: Topic; chapterName: string } | null>(null)

  useEffect(() => {
    if (!viewQuiz) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewQuiz(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewQuiz])

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load school curriculum')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])

  // Automatically expand the grade accordion for the active subject
  useEffect(() => {
    if (activeSubject) {
      setExpandedGrades(prev => ({
        ...prev,
        [activeSubject.grade]: true
      }))
    }
  }, [activeSubject?.id, activeSubject])

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
  const loadMasterTemplates = useCallback(async () => {
    try {
      const board = filterCategory === 'extra' ? EXTRA_BOARD : filterBoard
      const res = await fetch(`/api/platform/subjects?board=${board}&grade=${filterGrade}&category=${filterCategory}`)
      const data = await res.json()
      if (res.ok) {
        setMasterSubjects(data.subjects || data)
      }
    } catch {
      // quiet
    }
  }, [filterCategory, filterBoard, filterGrade])

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
  }, [showSubscribeModal, filterCategory, filterBoard, filterGrade, loadMasterTemplates])

  // Textbooks/handbooks uploaded once per subject on the platform side.
  useEffect(() => {
    if (!activeSubject) { setMaterials([]); return }
    const params = new URLSearchParams({
      school_id: String(schoolId),
      grade: activeSubject.grade,
      subject_name: activeSubject.subject_name,
    })
    fetch(`/api/school/subjects/materials?${params}`)
      .then(r => r.json())
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]))
  }, [activeSubject, schoolId])

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

      setSuccess('Successfully subscribed and cloned curriculum!')
      setShowSubscribeModal(false)
      setSelectedMasterId('')
      // Load and set active to new subject
      await loadSchoolSubjects(data.school_subject_id, subscribeYear || selectedYear)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe to subject')
    } finally {
      setSubscribing(false)
    }
  }

  // Pull in any master chapters added to the template after this school
  // subscribed — subscribing clones the catalog once, it doesn't stay in sync.
  const handleResync = async (subject: Subject) => {
    setResyncing(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/school/subjects/${subject.id}/resync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(
        data.chapters_added > 0
          ? `Synced ${data.chapters_added} new chapter${data.chapters_added === 1 ? '' : 's'} from the master template.`
          : 'Already up to date — no new chapters to sync.'
      )
      await loadSchoolSubjects(subject.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sync new chapters')
    } finally {
      setResyncing(false)
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

      setSuccess('Custom chapter added successfully!')
      setNewChapterName('')
      setShowAddChapterForm(null)
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add custom chapter')
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

      setSuccess('Chapter updated successfully!')
      setEditingChapterId(null)
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename chapter')
    }
  }

  const handleDeleteChapter = async (chapter: Chapter) => {
    if (!confirm(`Are you sure you want to delete the custom chapter "${chapter.chapter_name}"?\nAll custom topics and custom tasks under it will be deleted.`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/chapters?id=${chapter.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Custom chapter deleted')
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete chapter')
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

      setSuccess(topicModalState.mode === 'edit' ? 'Custom topic updated' : 'Custom topic created!')
      setTopicModalState(null)
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save topic')
    }
  }

  const handleDeleteTopic = async (topic: Topic) => {
    if (!confirm(`Delete custom topic "${topic.topic_name}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/topics?id=${topic.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Custom topic deleted')
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle task active status')
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

      setSuccess(taskModalState.mode === 'edit' ? 'Custom task updated' : 'Custom task added!')
      setTaskModalState(null)
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    }
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete custom task "${task.title}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/school/custom/tasks?id=${task.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Custom task deleted')
      await loadSchoolSubjects()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  // Books this subject actually has chapters for — only shown as a switcher
  // when there's more than one.
  const allChapters = (activeSubject?.chapters ?? []).slice().sort((a, b) => a.chapter_order - b.chapter_order)
  const bookGroups = computeBookGroups(allChapters)
  const effectiveBookKey = bookGroups.some(g => g.key === activeBookKey) ? activeBookKey : bookGroups[0]?.key ?? ''
  const effectiveBookGroup = bookGroups.find(g => g.key === effectiveBookKey) ?? null
  const sortedChapters = bookGroups.length > 1 && effectiveBookGroup ? effectiveBookGroup.chapters : allChapters

  // Group chapters by semester when the subject uses them — falls back to a
  // single flat bucket (no header) for subjects that don't split by semester,
  // mirroring platform-admin's curriculum page.
  const hasSemesters = sortedChapters.some(c => c.semester)
  const semesterGroups: { semester: string | null; chapters: Chapter[] }[] = hasSemesters
    ? Object.values(
        sortedChapters.reduce((acc, ch) => {
          const key = ch.semester || ' none'
          if (!acc[key]) acc[key] = { semester: ch.semester || null, chapters: [] }
          acc[key].chapters.push(ch)
          return acc
        }, {} as Record<string, { semester: string | null; chapters: Chapter[] }>)
      )
    : [{ semester: null, chapters: sortedChapters }]

  return (
    <div className="space-y-6">
      {/* Subject Header / Action Group */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border" style={{ borderColor: BORDER }}>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" style={{ color: INK }}>
            <BookOpen size={20} style={{ color: TEAL }} /> Syllabus Customizer & Custom Tasks
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Subscribe to Master templates, toggle optional exercises, and insert custom local school chapters/assignments.
          </p>
        </div>
        <button
          data-testid="curriculum-subscribe-open-btn"
          onClick={() => setShowSubscribeModal(true)}
          className="flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm"
          style={{ background: TEAL }}
        >
          <Sparkles size={14} /> Subscribe to Board Subject
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="px-4 py-3 rounded-xl flex justify-between items-center text-xs" style={{ background: '#FCEBEB', color: '#791F1F' }}>
          <span className="font-semibold">{error}</span>
          <button data-testid="curriculum-error-dismiss" onClick={() => setError('')} aria-label="Dismiss error"><X size={13} /></button>
        </div>
      )}

      {success && (
        <div className="px-4 py-3 rounded-xl flex justify-between items-center text-xs" style={{ background: '#E1F5EE', color: '#085041' }}>
          <span className="font-semibold">{success}</span>
          <button data-testid="curriculum-success-dismiss" onClick={() => setSuccess('')} aria-label="Dismiss success message"><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border rounded-3xl py-24 flex flex-col items-center justify-center gap-4" style={{ borderColor: BORDER }}>
          <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          <p className="text-xs text-gray-400 font-semibold">Loading curriculum overrides…</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-white border border-dashed rounded-3xl py-24 text-center" style={{ borderColor: BORDER }}>
          <BookOpen size={28} className="mx-auto mb-3" style={{ color: TEAL }} />
          <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>No Active Syllabus Subscriptions</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-6">
            Your school hasn&apos;t subscribed to any global board subjects yet. Subscribe to CBSE/SSC templates to customize your classes.
          </p>
          <button
            data-testid="curriculum-subscribe-open-btn-empty"
            onClick={() => setShowSubscribeModal(true)}
            className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm"
            style={{ background: TEAL }}
          >
            Choose & Subscribe to Subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

          {/* Active Subscribed Subjects Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Academic Year Selector Card */}
            <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: BORDER }}>
              <label className={labelCls}>Academic Service Year</label>
              <select
                data-testid="curriculum-year-select"
                value={selectedYear}
                onChange={e => handleYearChange(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                style={{ background: SURFACE, borderColor: BORDER, color: INK }}
              >
                {academicYears.map(y => (
                  <option key={y.id} value={y.label}>
                    {y.label} {y.is_current ? '• Active' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Accordion List */}
            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: BORDER }}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
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
                      <div key={grade} className="border rounded-xl overflow-hidden" style={{ borderColor: BORDER }}>
                        {/* Accordion Header */}
                        <button
                          data-testid={`curriculum-grade-toggle-${grade}`}
                          onClick={() => toggleGrade(grade)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold transition-colors"
                          style={{ background: isExpanded ? SURFACE : 'transparent', color: isExpanded ? INK : '#6b7280' }}
                        >
                          <span className="flex items-center gap-1.5">
                            Grade {grade}
                          </span>
                          {isExpanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                        </button>

                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="p-1.5 bg-white border-t space-y-1" style={{ borderColor: BORDER }}>
                            {gradeSubjects.map(s => {
                              const isActive = activeSubject?.id === s.id
                              return (
                                <button
                                  key={s.id}
                                  data-testid={`curriculum-subject-select-${s.id}`}
                                  onClick={() => {
                                    setActiveSubject(s)
                                    setEditingChapterId(null)
                                    setShowAddChapterForm(null)
                                  }}
                                  className="w-full text-left p-2.5 rounded-lg transition-all border text-xs flex flex-col gap-1"
                                  style={{
                                    background: isActive ? '#E7F3F4' : 'transparent',
                                    borderColor: isActive ? TEAL : 'transparent',
                                    color: isActive ? TEAL : '#6b7280',
                                  }}
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <span className="font-semibold truncate">{s.subject_name}</span>
                                    {s.board === EXTRA_BOARD && (
                                      <span
                                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                                        style={{ background: '#E7F3F4', color: TEAL }}
                                      >
                                        Extra
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                                    <span>{s.board === EXTRA_BOARD ? 'Extra Subject' : (s.board || 'Custom')}</span>
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
            <div className="rounded-2xl border p-4 text-[11px] text-gray-500 leading-relaxed" style={{ background: SURFACE, borderColor: BORDER }}>
              <p className="font-semibold mb-1 flex items-center gap-1" style={{ color: INK }}>
                <Sparkles size={12} style={{ color: TEAL }} /> Inheritance Rules
              </p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Board mandated subjects, chapters, and topics are locked (cannot be deleted or renamed).</li>
                <li>You can add custom local chapters or topics in between them.</li>
                <li>Mandatory tasks are locked, but optional master exercises can be deactivated for your teachers using the toggles.</li>
                <li>Click a blue quiz badge to preview a topic&apos;s approved questions (read-only).</li>
              </ul>
            </div>
          </div>

          {/* Main Override Workspace */}
          <div className="lg:col-span-3 space-y-6">
            {activeSubject && (
              <>
                {/* Active Subscribed Subject Summary Card */}
                <div className="rounded-2xl p-6 shadow-sm relative overflow-hidden" style={{ background: INK }}>
                  <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-2xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(42,127,140,0.25)', color: '#9FD8DF' }}>
                          {activeSubject.board || 'Local School'} Template
                        </span>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.1)' }}>
                          Grade {activeSubject.grade}
                        </span>
                      </div>
                      <h2 className="text-2xl font-semibold mt-3 text-white tracking-tight">{activeSubject.subject_name}</h2>
                      <p className="text-xs mt-1" style={{ color: '#9FB8C7' }}>
                        Subscribed: {new Date(activeSubject.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <button
                        data-testid="curriculum-add-chapter-open-btn"
                        onClick={() => setShowAddChapterForm(activeSubject.id)}
                        className="text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md self-start"
                        style={{ background: 'white', color: INK }}
                      >
                        + Add Custom Chapter
                      </button>
                      {activeSubject.master_subject_id && (activeSubject.master_chapter_count ?? 0) > (activeSubject.chapters?.length ?? 0) && (
                        <button
                          data-testid="curriculum-resync-btn"
                          onClick={() => handleResync(activeSubject)}
                          disabled={resyncing}
                          className="text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md self-start disabled:opacity-50"
                          style={{ background: TEAL, color: 'white' }}
                        >
                          {resyncing ? 'Syncing…' : `Sync ${(activeSubject.master_chapter_count ?? 0) - (activeSubject.chapters?.length ?? 0)} New Chapter${(activeSubject.master_chapter_count ?? 0) - (activeSubject.chapters?.length ?? 0) === 1 ? '' : 's'}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Add Chapter Inline form */}
                  {showAddChapterForm === activeSubject.id && (
                    <div className="mt-5 pt-5 border-t flex gap-2 items-center p-4 rounded-xl" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
                      <input
                        data-testid="curriculum-new-chapter-input"
                        type="text"
                        placeholder="Chapter Title (e.g. Unit 6: Practical Lab Exercises)"
                        value={newChapterName}
                        onChange={e => setNewChapterName(e.target.value)}
                        className="flex-1 border rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                        style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
                        autoFocus
                      />
                      <button
                        data-testid="curriculum-new-chapter-submit"
                        onClick={() => handleAddChapter(activeSubject.id)}
                        disabled={!newChapterName.trim()}
                        className="text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
                        style={{ background: TEAL }}
                      >
                        Add
                      </button>
                      <button
                        data-testid="curriculum-new-chapter-cancel"
                        onClick={() => {
                          setShowAddChapterForm(null)
                          setNewChapterName('')
                        }}
                        className="text-xs text-gray-300 hover:text-white px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Textbooks & Handbooks — uploaded once per subject, platform-side */}
                {materials.length > 0 && (
                  <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Textbooks & Handbooks</h5>
                    <div className="space-y-2">
                      {materials.map(m => (
                        <div key={m.id} className="flex items-center gap-2 rounded-xl p-3 border" style={{ background: SURFACE, borderColor: BORDER }}>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0" style={m.material_type === 'textbook' ? { background: '#E6F1FB', color: '#0C447C' } : { background: '#FAEEDA', color: '#633806' }}>
                            {m.material_type}
                          </span>
                          <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold truncate hover:underline" style={{ color: INK }}>{m.title}</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Book tabs — only when this subject has more than one book */}
                {bookGroups.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {bookGroups.map(g => {
                      const active = g.key === effectiveBookKey
                      const badge = audienceBadge(g.chapters)
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setActiveBookKey(g.key)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                          style={{ background: active ? INK : 'white', color: active ? 'white' : INK, borderColor: active ? INK : BORDER }}
                        >
                          {g.label}{badge ? ` · ${badge}` : ''}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Chapter tree list */}
                {(!activeSubject.chapters || activeSubject.chapters.length === 0) ? (
                  <div className="bg-white border rounded-2xl py-12 text-center text-gray-500 text-xs" style={{ borderColor: BORDER }}>
                    No chapters exist for this subject. Create a custom chapter to get started.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {semesterGroups.map(group => (
                      <div key={group.semester ?? '__none__'} className="space-y-4">
                        {group.semester && (
                          <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: INK }}>{group.semester}</h3>
                        )}
                        {group.chapters.map(ch => {
                        const chIdx = sortedChapters.findIndex(c => c.id === ch.id)
                        const isEditingCh = editingChapterId === ch.id

                        return (
                          <div key={ch.id} className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: BORDER }}>

                            {/* Chapter Header */}
                            <div className="flex items-start justify-between gap-3 pb-3 border-b flex-wrap" style={{ borderColor: '#EFEDE6' }}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ background: SURFACE, color: INK }}>
                                  {chIdx + 1}
                                </div>
                                {isEditingCh ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      data-testid={`chapter-${ch.id}-rename-input`}
                                      type="text"
                                      value={editingChapterName}
                                      onChange={e => setEditingChapterName(e.target.value)}
                                      className="border rounded-lg px-2 py-1 text-xs"
                                      style={{ borderColor: BORDER, color: INK }}
                                      autoFocus
                                    />
                                    <button
                                      data-testid={`chapter-${ch.id}-rename-save`}
                                      onClick={() => handleSaveEditChapter(ch)}
                                      className="text-xs text-white px-2 py-1 rounded"
                                      style={{ background: GREEN }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      data-testid={`chapter-${ch.id}-rename-cancel`}
                                      onClick={() => setEditingChapterId(null)}
                                      className="text-xs text-gray-500 px-1"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-semibold text-sm" style={{ color: INK }}>{ch.chapter_name}</h3>
                                      {ch.is_custom ? (
                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase" style={{ background: '#E1F5EE', color: '#085041' }}>
                                          Custom School Chapter
                                        </span>
                                      ) : (
                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1" style={{ background: '#FCEBDB', color: '#8A4B12' }}>
                                          <Lock size={9} /> Locked Chapter
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Chapter Order: {chIdx + 1}</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    data-testid={`chapter-${ch.id}-edit-btn`}
                                    onClick={() => handleStartEditChapter(ch)}
                                    className="text-gray-400 hover:text-gray-600 p-1"
                                    title="Rename Chapter"
                                    aria-label={`Rename chapter ${ch.chapter_name}`}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  {ch.is_custom ? (
                                    <button
                                      data-testid={`chapter-${ch.id}-delete-btn`}
                                      onClick={() => handleDeleteChapter(ch)}
                                      className="text-gray-400 hover:text-red-500 p-1"
                                      title="Delete Chapter"
                                      aria-label={`Delete chapter ${ch.chapter_name}`}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium px-2 py-0.5 rounded-lg" style={{ background: SURFACE }} title="Mandatory Chapter cannot be deleted">
                                      <Lock size={9} /> Board Chapter
                                    </span>
                                  )}
                                </div>

                                <button
                                  data-testid={`chapter-${ch.id}-add-topic-btn`}
                                  onClick={() => handleOpenAddTopic(ch.id)}
                                  className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ml-2"
                                  style={{ background: SURFACE, color: INK }}
                                >
                                  + Custom Topic
                                </button>
                                <button
                                  data-testid={`chapter-${ch.id}-add-task-btn`}
                                  onClick={() => handleOpenAddTask(ch.id)}
                                  className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                                  style={{ background: '#E7F3F4', color: TEAL }}
                                >
                                  + Custom Task
                                </button>
                              </div>
                            </div>

                            {/* Topics list & Tasks list inside chapter */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                              {/* Topics Area */}
                              <div className="space-y-2.5">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pb-1">
                                  Topics in this Chapter
                                </h4>

                                {(!ch.topics || ch.topics.length === 0) ? (
                                  <div className="text-[11px] text-gray-400 italic py-2">No topics. Add custom topics above.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {ch.topics
                                      .sort((a, b) => a.topic_order - b.topic_order)
                                      .map(topic => {
                                        const qCount = topic.questions?.length || 0
                                        return (
                                        <div key={topic.id} className="rounded-xl p-3 flex flex-col gap-1.5 border" style={{ background: SURFACE, borderColor: BORDER }}>
                                          <div className="flex items-start justify-between gap-2">
                                            <div>
                                              <p className="text-xs font-bold" style={{ color: INK }}>
                                                {topic.topic_order + 1}. {topic.topic_name}
                                              </p>
                                              {topic.is_custom ? (
                                                <span className="text-[8px] font-bold px-1 rounded" style={{ background: '#E1F5EE', color: '#085041' }}>
                                                  Custom School Override
                                                </span>
                                              ) : (
                                                <span className="text-[8px] font-bold px-1 rounded flex items-center gap-0.5 w-fit" style={{ background: '#FCEBDB', color: '#8A4B12' }}>
                                                  <Lock size={8} /> Mandated
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex gap-1 items-center shrink-0">
                                              <button
                                                data-testid={`topic-${topic.id}-edit-btn`}
                                                onClick={() => handleOpenEditTopic(ch.id, topic)}
                                                className="text-gray-400 hover:text-gray-600 p-0.5"
                                                title="Edit Topic Content"
                                                aria-label={`Edit topic ${topic.topic_name}`}
                                              >
                                                <Pencil size={12} />
                                              </button>
                                              {topic.is_custom ? (
                                                <button
                                                  data-testid={`topic-${topic.id}-delete-btn`}
                                                  onClick={() => handleDeleteTopic(topic)}
                                                  className="text-gray-400 hover:text-red-500 p-0.5"
                                                  title="Delete Topic"
                                                  aria-label={`Delete topic ${topic.topic_name}`}
                                                >
                                                  <X size={12} />
                                                </button>
                                              ) : (
                                                <span className="text-[9px] text-gray-400" title="Board topic cannot be deleted"><Lock size={10} /></span>
                                              )}
                                            </div>
                                          </div>

                                          {topic.content_text && (
                                            <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{topic.content_text}</p>
                                          )}

                                          {topic.content_pdf_url && (
                                            <p className="text-[9px] font-semibold truncate flex items-center gap-1" style={{ color: TEAL }}>
                                              <FileText size={10} />
                                              <a data-testid={`topic-${topic.id}-pdf-link`} href={topic.content_pdf_url} target="_blank" rel="noreferrer" className="underline">{topic.content_pdf_url}</a>
                                            </p>
                                          )}

                                          {topic.subtopics && topic.subtopics.length > 0 && (
                                            <ul className="mt-0.5 space-y-0.5">
                                              {topic.subtopics.map((st, si) => (
                                                <li key={si} className="text-[10px] text-gray-500">— {st}</li>
                                              ))}
                                            </ul>
                                          )}

                                          {/* Resources list inside topic */}
                                          {topic.resources && topic.resources.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                              {topic.resources.map(res => (
                                                <span
                                                  key={res.id}
                                                  className="text-[8px] border px-1.5 py-0.5 rounded font-mono truncate max-w-[140px] flex items-center gap-1"
                                                  style={{ background: 'white', borderColor: BORDER, color: '#6b7280' }}
                                                  title={`${res.title} (${res.resource_type})`}
                                                >
                                                  {res.resource_type === 'video' ? <Video size={9} /> : <LinkIcon size={9} />} {res.title}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Quiz preview trigger — read-only view of the topic's approved questions */}
                                          <div className="mt-0.5">
                                            {qCount > 0 ? (
                                              <button
                                                data-testid={`topic-${topic.id}-view-quiz-btn`}
                                                onClick={() => setViewQuiz({ topic, chapterName: ch.chapter_name })}
                                                className="hover:opacity-80"
                                                title="View quiz questions"
                                              >
                                                <QuizPill count={qCount} />
                                              </button>
                                            ) : (
                                              <QuizPill count={0} />
                                            )}
                                          </div>
                                        </div>
                                      )})}
                                  </div>
                                )}
                              </div>

                              {/* Exercises & Tasks Area */}
                              <div className="space-y-2.5">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pb-1">
                                  Exercises & Homework Tasks
                                </h4>

                                {(!ch.tasks || ch.tasks.length === 0) ? (
                                  <div className="text-[11px] text-gray-400 italic py-2">No tasks assigned. Click Custom Task to add.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {ch.tasks.map(task => {
                                      const mappedTopic = ch.topics?.find(t => t.id === task.school_topic_id)

                                      return (
                                        <div
                                          key={task.id}
                                          className="border rounded-xl p-3 flex flex-col gap-1 transition-all"
                                          style={{
                                            background: task.is_active ? SURFACE : '#F1F0EC',
                                            borderColor: BORDER,
                                            opacity: task.is_active ? 1 : 0.6,
                                          }}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <p className={`text-xs font-bold ${task.is_active ? '' : 'line-through'}`} style={{ color: task.is_active ? INK : '#9ca3af' }}>
                                                  {task.title}
                                                </p>
                                                {task.is_custom ? (
                                                  <span className="text-[8px] font-bold px-1 rounded uppercase" style={{ background: '#E1F5EE', color: '#085041' }}>
                                                    Custom
                                                  </span>
                                                ) : task.is_mandatory ? (
                                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                                                    <Lock size={8} /> Mandated
                                                  </span>
                                                ) : (
                                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase" style={{ background: '#FAEEDA', color: '#633806' }}>
                                                    Board Optional
                                                  </span>
                                                )}
                                              </div>
                                              {mappedTopic && (
                                                <p className="text-[8.5px] text-gray-400 mt-0.5">
                                                  Linked topic: <span className="font-semibold">{mappedTopic.topic_name}</span>
                                                </p>
                                              )}
                                            </div>

                                            {/* Action Control: Mandatory exercises cannot be toggled or deleted. Optional can be toggled. Custom can be edited/deleted. */}
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                data-testid={`task-${task.id}-edit-btn`}
                                                onClick={() => handleOpenEditTask(ch.id, task)}
                                                className="text-gray-400 hover:text-gray-600 p-0.5"
                                                title="Edit Task"
                                                aria-label={`Edit task ${task.title}`}
                                              >
                                                <Pencil size={12} />
                                              </button>
                                              {task.is_custom ? (
                                                <button
                                                  data-testid={`task-${task.id}-delete-btn`}
                                                  onClick={() => handleDeleteTask(task)}
                                                  className="text-gray-400 hover:text-red-500 p-0.5"
                                                  title="Delete Task"
                                                  aria-label={`Delete task ${task.title}`}
                                                >
                                                  <X size={12} />
                                                </button>
                                              ) : !task.is_mandatory ? (
                                                <label className="relative inline-flex items-center cursor-pointer scale-90" title={task.is_active ? 'Deactivate Task' : 'Activate Task'}>
                                                  <input
                                                    data-testid={`task-${task.id}-active-toggle`}
                                                    type="checkbox"
                                                    checked={task.is_active}
                                                    onChange={() => handleToggleTaskActive(task)}
                                                    className="sr-only peer"
                                                  />
                                                  <div
                                                    className="w-7 h-4 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all transition-colors"
                                                    style={{ background: task.is_active ? TEAL : '#cbd5e1' }}
                                                  />
                                                </label>
                                              ) : (
                                                <span className="text-[9px] text-gray-400 font-semibold" title="Mandatory Curriculum Requirement">
                                                  Required
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {task.instructions && (
                                            <p className={`text-[10px] leading-relaxed ${task.is_active ? 'text-gray-500' : 'text-gray-400 line-through'}`}>
                                              {task.instructions}
                                            </p>
                                          )}

                                          <div className="flex gap-2.5 mt-1 text-[9px] text-gray-400 font-medium">
                                            <span className="px-1.5 py-0.5 rounded capitalize" style={{ background: 'white', border: `1px solid ${BORDER}` }}>{task.task_type}</span>
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
                    ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <button data-testid="subscribe-modal-close" onClick={() => setShowSubscribeModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-lg" aria-label="Close subscribe modal">
              <X size={18} />
            </button>

            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: INK }}>
              Subscribe to Board Curriculum Templates
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Select an academic board and grade level, choose a master subject template, and clone it instantly into your school workspace.
            </p>

            <div className="flex gap-1 p-1 rounded-xl mb-4 w-fit" style={{ background: SURFACE }}>
              {(['academic', 'extra'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  data-testid={`subscribe-category-${c}`}
                  onClick={() => setFilterCategory(c)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: filterCategory === c ? TEAL : 'transparent', color: filterCategory === c ? 'white' : '#6b7280' }}
                >
                  {c === 'academic' ? 'Board Subjects' : 'Extra Subjects'}
                </button>
              ))}
            </div>

            <div className={`grid gap-3 mb-4 ${filterCategory === 'academic' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {filterCategory === 'academic' && (
              <div>
                <label className={labelCls}>Academic Board</label>
                <select
                  data-testid="subscribe-board-select"
                  value={filterBoard}
                  onChange={e => setFilterBoard(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                  style={{ background: SURFACE, borderColor: BORDER, color: INK }}
                >
                  <option value="CBSE">CBSE (Central Board)</option>
                  <option value="AP_SSC">AP SSC (Andhra Pradesh)</option>
                  <option value="TS_SSC">TS SSC (Telangana)</option>
                </select>
              </div>
              )}
              <div>
                <label className={labelCls}>Grade Level</label>
                <select
                  data-testid="subscribe-grade-select"
                  value={filterGrade}
                  onChange={e => setFilterGrade(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                  style={{ background: SURFACE, borderColor: BORDER, color: INK }}
                >
                  <option value="6">Grade 6</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                  <option value="10">Grade 10</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Target Year</label>
                <select
                  data-testid="subscribe-year-select"
                  value={subscribeYear}
                  onChange={e => setSubscribeYear(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                  style={{ background: SURFACE, borderColor: BORDER, color: INK }}
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
            <div className="mb-5 rounded-2xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Assign to Class Sections (Grade {filterGrade})
              </label>
              {classes.filter(c => c.grade.toString().trim() === filterGrade.toString().trim()).length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">
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
                          data-testid={`subscribe-class-${cls.id}-toggle`}
                          type="button"
                          onClick={() => {
                            setSelectedClassIds(prev =>
                              isChecked ? prev.filter(id => id !== cls.id) : [...prev, cls.id]
                            )
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background: isChecked ? TEAL : 'white',
                            borderColor: isChecked ? TEAL : BORDER,
                            color: isChecked ? 'white' : '#6b7280',
                          }}
                        >
                          <Check size={12} className={isChecked ? 'opacity-100' : 'opacity-0'} />
                          <span>Section {cls.section}</span>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>

            <div className="space-y-2 mb-6">
              <label className={labelCls}>Select Available Template Subject *</label>

              {masterSubjects.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4 rounded-xl border" style={{ background: SURFACE, borderColor: BORDER }}>
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
                        className="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all"
                        style={{
                          background: alreadySubscribed ? SURFACE : selectedMasterId === String(sub.id) ? '#E7F3F4' : 'white',
                          borderColor: alreadySubscribed ? BORDER : selectedMasterId === String(sub.id) ? TEAL : BORDER,
                          color: alreadySubscribed ? '#9ca3af' : selectedMasterId === String(sub.id) ? TEAL : '#374151',
                          opacity: alreadySubscribed ? 0.6 : 1,
                          cursor: alreadySubscribed ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            data-testid={`subscribe-master-${sub.id}-radio`}
                            type="radio"
                            name="masterSubject"
                            value={sub.id}
                            disabled={alreadySubscribed}
                            checked={selectedMasterId === String(sub.id)}
                            onChange={() => setSelectedMasterId(String(sub.id))}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-xs font-bold">{sub.subject_name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">{sub.board} · Grade {sub.grade}</p>
                          </div>
                        </div>
                        {alreadySubscribed && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: BORDER, color: '#6b7280' }}>
                            Subscribed
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: '#EFEDE6' }}>
              <button
                data-testid="subscribe-modal-cancel"
                type="button"
                onClick={() => setShowSubscribeModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                data-testid="subscribe-modal-submit"
                type="button"
                onClick={handleSubscribe}
                disabled={subscribing || !selectedMasterId}
                className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-md"
                style={{ background: TEAL }}
              >
                {subscribing ? 'Cloning Syllabus...' : 'Subscribe & Clone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Topic Modal */}
      {topicModalState?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 relative shadow-2xl my-8">
            <button data-testid="topic-modal-close" onClick={() => setTopicModalState(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-lg" aria-label="Close topic modal">
              <X size={18} />
            </button>

            <h3 className="text-base font-semibold mb-2" style={{ color: INK }}>
              {topicModalState.mode === 'edit' ? 'Edit Custom Topic' : 'Create Custom Topic'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Add direct syllabus reading content, textbook PDF link, and digital reference assets.
            </p>

            <form onSubmit={handleSaveTopic} className="space-y-4">
              <div>
                <label className={labelCls}>Topic Title *</label>
                <input
                  data-testid="topic-modal-name-input"
                  type="text"
                  placeholder="e.g. Practical Lab Activity 1"
                  required
                  value={topicForm.topic_name}
                  onChange={e => setTopicForm(prev => ({ ...prev, topic_name: e.target.value }))}
                  className={inputCls}
                  style={{ borderColor: BORDER }}
                />
              </div>
              <div>
                <label className={labelCls}>Study Content (Text)</label>
                <textarea
                  data-testid="topic-modal-content-textarea"
                  placeholder="Direct lesson content/instructions for teachers..."
                  rows={4}
                  value={topicForm.content_text}
                  onChange={e => setTopicForm(prev => ({ ...prev, content_text: e.target.value }))}
                  className={`${inputCls} resize-none`}
                  style={{ borderColor: BORDER }}
                />
              </div>
              <div>
                <label className={labelCls}>Textbook PDF Link Reference</label>
                <input
                  data-testid="topic-modal-pdf-input"
                  type="url"
                  placeholder="https://example.com/custom-materials.pdf"
                  value={topicForm.content_pdf_url}
                  onChange={e => setTopicForm(prev => ({ ...prev, content_pdf_url: e.target.value }))}
                  className={inputCls}
                  style={{ borderColor: BORDER }}
                />
              </div>

              {/* Resources builder inside Topic Form */}
              <div className="border-t pt-3" style={{ borderColor: '#EFEDE6' }}>
                <h4 className="text-xs font-semibold mb-2" style={{ color: INK }}>Media & Attachments</h4>

                {topicForm.resources.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {topicForm.resources.map((res, rIdx) => (
                      <div key={rIdx} className="flex items-center justify-between border p-2 rounded-lg text-xs" style={{ background: SURFACE, borderColor: BORDER }}>
                        <span className="truncate font-semibold flex items-center gap-1.5" style={{ color: INK }}>
                          {res.resource_type === 'video' ? <Video size={11} /> : <LinkIcon size={11} />} {res.title}
                        </span>
                        <button
                          data-testid={`topic-modal-remove-resource-${rIdx}-btn`}
                          type="button"
                          onClick={() => handleRemoveResourceItem(rIdx)}
                          className="text-xs px-2"
                          style={{ color: '#791F1F' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                  <div className="sm:col-span-1">
                    <select
                      data-testid="topic-modal-resource-type-select"
                      value={newResource.resource_type}
                      onChange={e => setNewResource(prev => ({ ...prev, resource_type: e.target.value }))}
                      className="w-full bg-white border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={{ borderColor: BORDER, color: INK }}
                    >
                      <option value="video">Video</option>
                      <option value="gdoc">Google Doc</option>
                      <option value="pdf">PDF Link</option>
                      <option value="url">Other Link</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 space-y-2">
                    <input
                      data-testid="topic-modal-resource-title-input"
                      type="text"
                      placeholder="Attachment Title (e.g. Lab Demonstration Link)"
                      value={newResource.title}
                      onChange={e => setNewResource(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-white border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                      style={{ borderColor: BORDER, color: INK }}
                    />
                    <div className="flex gap-2">
                      <input
                        data-testid="topic-modal-resource-url-input"
                        type="url"
                        placeholder="https://..."
                        value={newResource.url}
                        onChange={e => setNewResource(prev => ({ ...prev, url: e.target.value }))}
                        className="flex-1 bg-white border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ borderColor: BORDER, color: INK }}
                      />
                      <button
                        data-testid="topic-modal-add-resource-btn"
                        type="button"
                        onClick={handleAddResourceItem}
                        disabled={!newResource.title.trim() || !newResource.url.trim()}
                        className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                        style={{ background: TEAL }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: '#EFEDE6' }}>
                <button
                  data-testid="topic-modal-cancel"
                  type="button"
                  onClick={() => setTopicModalState(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  data-testid="topic-modal-submit"
                  type="submit"
                  className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md"
                  style={{ background: TEAL }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
            <button data-testid="task-modal-close" onClick={() => setTaskModalState(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-lg" aria-label="Close task modal">
              <X size={18} />
            </button>

            <h3 className="text-base font-semibold mb-2" style={{ color: INK }}>
              {taskModalState.mode === 'edit' ? 'Edit Custom Task' : 'Add Custom School Exercise'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Add homework assignments, tests, or worksheets specific to your local classes.
            </p>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className={labelCls}>Exercise Title *</label>
                <input
                  data-testid="task-modal-title-input"
                  type="text"
                  placeholder="e.g. End of Unit Written Test"
                  required
                  value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  className={inputCls}
                  style={{ borderColor: BORDER }}
                />
              </div>

              <div>
                <label className={labelCls}>Link to Specific Topic (Optional)</label>
                <select
                  data-testid="task-modal-topic-select"
                  value={taskForm.school_topic_id}
                  onChange={e => setTaskForm(prev => ({ ...prev, school_topic_id: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                  style={{ background: SURFACE, borderColor: BORDER, color: INK }}
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
                  <label className={labelCls}>Task Type</label>
                  <select
                    data-testid="task-modal-type-select"
                    value={taskForm.task_type}
                    onChange={e => setTaskForm(prev => ({ ...prev, task_type: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2"
                    style={{ background: SURFACE, borderColor: BORDER, color: INK }}
                  >
                    <option value="homework">Homework</option>
                    <option value="test">Test</option>
                    <option value="worksheet">Worksheet</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Max Marks</label>
                  <input
                    data-testid="task-modal-maxmarks-input"
                    type="number"
                    min={1}
                    max={100}
                    value={taskForm.max_marks}
                    onChange={e => setTaskForm(prev => ({ ...prev, max_marks: parseInt(e.target.value) || 10 }))}
                    className={inputCls}
                    style={{ borderColor: BORDER }}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Task Instructions & Description</label>
                <textarea
                  data-testid="task-modal-instructions-textarea"
                  placeholder="Provide instruction steps, study links, or page references for students..."
                  rows={3}
                  value={taskForm.instructions}
                  onChange={e => setTaskForm(prev => ({ ...prev, instructions: e.target.value }))}
                  className={`${inputCls} resize-none`}
                  style={{ borderColor: BORDER }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: '#EFEDE6' }}>
                <button
                  data-testid="task-modal-cancel"
                  type="button"
                  onClick={() => setTaskModalState(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  data-testid="task-modal-submit"
                  type="submit"
                  className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md"
                  style={{ background: TEAL }}
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-only quiz preview modal — ported from the Ulearn prototype's SchoolView.
          Shows a topic's approved questions with the correct option highlighted and
          the grounding `source`, if any. Escape or backdrop click closes it. */}
      {viewQuiz && (
        <div
          data-testid="quiz-preview-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,42,63,0.45)' }}
          onClick={() => setViewQuiz(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Quiz for ${viewQuiz.topic.topic_name}`}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 border-b sticky top-0 bg-white" style={{ borderColor: BORDER }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: INK }}>Quiz · {viewQuiz.topic.topic_name}</div>
                <div className="text-xs text-gray-400">
                  From &quot;{viewQuiz.chapterName}&quot; · {viewQuiz.topic.questions?.length || 0} approved question{(viewQuiz.topic.questions?.length || 0) === 1 ? '' : 's'} · read-only · press Esc to close
                </div>
              </div>
              <button data-testid="quiz-preview-close" onClick={() => setViewQuiz(null)} aria-label="Close quiz preview" className="p-1 rounded hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {(!viewQuiz.topic.questions || viewQuiz.topic.questions.length === 0) && (
                <div className="text-sm text-gray-400">No approved questions yet.</div>
              )}
              {viewQuiz.topic.questions?.map((q, qi) => (
                <div key={qi} className="rounded-xl border p-3" style={{ borderColor: BORDER }}>
                  <div className="text-sm font-medium mb-2" style={{ color: INK }}>{qi + 1}. {q.q}</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {q.options.map((o, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg"
                        style={{ background: i === q.answer ? '#E1F5EE' : SURFACE, color: i === q.answer ? '#085041' : '#4b5563' }}
                      >
                        {i === q.answer ? <Check size={13} /> : <span className="w-3.5" />} {o}
                      </div>
                    ))}
                  </div>
                  {q.source && (
                    <div className="flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-2 mt-2" style={{ background: '#F5F2EA', color: '#6b7280' }}>
                      <Quote size={12} className="mt-0.5 shrink-0" /> {q.source}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
