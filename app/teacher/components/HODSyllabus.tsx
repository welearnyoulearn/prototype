'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  BookOpen, Plus, Upload, ChevronDown, X, Check, Trash2,
  Sparkles, FileText, Loader2, Eye,
} from 'lucide-react'
import TopicContentViewer from '@/app/components/TopicContentViewer'
import { INK, GOLD, CREAM, CORAL, GREEN, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { StatusPill, QuizPill, ProgressBar, Toast } from '@/app/components/ulearn/primitives'
import { useToast } from '@/app/components/ulearn/useToast'

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

type Question = { q: string; options: string[]; answer: number; source?: string }
type Resource = { id: number; title: string; url: string; resource_type: string }

type Topic = {
  id: number
  topic_name: string
  topic_order: number
  status: string
  published: boolean
  covered_date: string | null
  covered_by_name: string | null
  target_date: string | null
  delay_reason: string | null
  hod_remark: string | null
  hod_remark_by_name: string | null
  hod_remark_at: string | null
  content_text?: string
  content_pdf_url?: string
  questions?: Question[] | string | null
  resources?: Resource[] | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  total: number
  covered: number
  behind: number
  topics: Topic[]
}

// Real question count — `questions` may arrive as a JSON array or a raw string
// depending on the DB driver's json handling; TopicContentViewer parses the
// same way, so we mirror that here for the QuizPill count.
function questionCount(q: Topic['questions']): number {
  if (!q) return 0
  if (Array.isArray(q)) return q.length
  try {
    const parsed = JSON.parse(q)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
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
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)

  const { toast, flash } = useToast()

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

  // Load/publish state
  const [loadMsg, setLoadMsg] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishedMsg, setPublishedMsg] = useState('')

  // PDF syllabus load (inline panel)
  const [loadPdfOpen, setLoadPdfOpen] = useState(false)
  const [pdfFile, setPdfFile]         = useState<File | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfMsg, setPdfMsg]           = useState<string>('')
  const [pdfProgress, setPdfProgress] = useState(0)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // AI homework suggestion
  type HWSuggestion = { title: string; instructions: string; max_marks: number; estimated_time_minutes: number }
  const [suggestion, setSuggestion] = useState<HWSuggestion | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignedMsg, setAssignedMsg] = useState('')
  const suggestionRef = useRef<HTMLDivElement>(null)

  // Reset class selection + suggestion when subject changes
  useEffect(() => {
    setSelectedClassId(null)
    setClasses([])
    setStagedChapter(null)
    setExpandedChapter(null)
    setSuggestion(null)
    setSuggestError(false)
    setLoadMsg('')
    setPublishedMsg('')
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
        `/api/syllabus?school_id=${teacher.school_id}&class_id=${selectedClassId}&subject=${encodeURIComponent(selectedSubject)}&hod=1`
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

  useEffect(() => {
    if ((suggestion || suggestLoading) && suggestionRef.current) {
      suggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [suggestion, suggestLoading])

  async function patchTopic(id: number, payload: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/syllabus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: teacher.school_id, class_id: selectedClassId, ...payload }),
      })
      if (!res.ok) throw new Error()
      await loadSyllabus()
    } catch { setError('Failed to save') }
    finally { setSaving(null) }
  }

  // "Mark taught" — flips school_topic_progress.status between covered/pending
  // via PATCH /api/syllabus/:id (the only real progress state the API supports).
  // TODO(syllabus-unlock): the Ulearn prototype's "mark taught auto-unlocks the
  // next topic + opens its quiz to students" has no backing today — there is no
  // locked/unlocked column, ordering gate, or quiz-visibility gate in the schema
  // or API (TopicContentViewer already shows every topic's quiz unconditionally
  // to students regardless of status). Marking a topic taught here only updates
  // this topic's own progress row; it does not lock/unlock siblings. Needs new
  // schema + API work before that flow can be real.
  async function coverTopic(topic: Topic, chapterName: string) {
    const newStatus = topic.status === 'covered' ? 'pending' : 'covered'
    setSuggestion(null)
    setSuggestError(false)
    await patchTopic(topic.id, { status: newStatus, covered_by: teacher.id })
    flash(newStatus === 'covered' ? `"${topic.topic_name}" marked taught` : `"${topic.topic_name}" marked pending`)
    if (newStatus === 'covered') {
      const selectedClass = classes.find(c => c.id === selectedClassId)
      setSuggestLoading(true)
      try {
        const sg = await fetch('/api/ai/suggest-homework', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: selectedSubject,
            chapter_name: chapterName,
            topic_name: topic.topic_name,
            grade: selectedClass?.grade ?? '',
            school_id: teacher.school_id,
          }),
        })
        if (sg.ok) setSuggestion(await sg.json())
        else setSuggestError(true)
      } catch { setSuggestError(true) }
      finally { setSuggestLoading(false) }
    }
  }

  async function assignHomework() {
    if (!suggestion || !selectedClassId) return
    setAssigning(true)
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: teacher.school_id,
          class_id: selectedClassId,
          teacher_id: teacher.id,
          subject: selectedSubject,
          title: suggestion.title,
          instructions: suggestion.instructions,
          task_type: 'homework',
          max_marks: suggestion.max_marks,
          due_date: tomorrow.toISOString().slice(0, 10),
          status: 'published',
          assigned_to: 'all',
        }),
      })
      setAssignedMsg('Homework assigned to all students!')
      setSuggestion(null)
    } finally { setAssigning(false) }
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

  async function deleteChapter(chapterName: string) {
    if (!confirm(`Delete chapter "${chapterName}" and all its topics? This cannot be undone.`)) return
    try {
      await fetch(
        `/api/syllabus?school_id=${teacher.school_id}&class_id=${selectedClassId}&subject=${encodeURIComponent(selectedSubject)}&chapter_name=${encodeURIComponent(chapterName)}`,
        { method: 'DELETE' }
      )
      await loadSyllabus()
    } catch { setError('Failed to delete chapter') }
  }

  async function loadFromPDF() {
    if (!pdfFile || !selectedClassId) return
    const cls = classes.find(c => c.id === selectedClassId)
    if (!cls) return
    setPdfUploading(true)
    setPdfMsg('')
    setPdfProgress(10)
    const fd = new FormData()
    fd.append('school_id', String(teacher.school_id))
    fd.append('class_id', String(selectedClassId))
    fd.append('grade', cls.grade)
    fd.append('subject', selectedSubject)
    fd.append('uploaded_by_name', teacher.name || 'HOD')
    fd.append('file', pdfFile)
    try {
      const ticker = setInterval(() => setPdfProgress(p => Math.min(p + 5, 80)), 1000)
      const res  = await fetch('/api/syllabus/pdf-load', { method: 'POST', body: fd })
      const data = await res.json()
      clearInterval(ticker)
      setPdfProgress(100)
      if (!res.ok) {
        setPdfMsg(`Error: ${data.error || 'Failed to process PDF'}`)
      } else {
        setLoadPdfOpen(false)
        setPdfFile(null)
        if (pdfInputRef.current) pdfInputRef.current.value = ''
        setPdfMsg('')
        setLoadMsg(`${data.inserted} topics loaded from PDF (${data.chapters_count} chapters, ${data.pages} pages) — review and publish when ready`)
        await loadSyllabus()
      }
    } catch {
      setPdfMsg('Upload failed — please check the file and try again')
    } finally {
      setPdfUploading(false)
      setTimeout(() => setPdfProgress(0), 1500)
    }
  }

  // TODO(syllabus-publish): POST /api/syllabus/publish still targets a legacy
  // `syllabus_topics(published)` table that doesn't exist in the current
  // school_subjects → school_chapters → school_topics schema (GET /api/syllabus
  // hardcodes published:true on every row already). This call is pre-existing
  // and left wired as-is per scope — it will currently no-op/500 server-side.
  // Flagged, not fabricated a fix.
  async function publishSyllabus() {
    if (!selectedClassId) return
    setPublishing(true)
    setPublishedMsg('')
    try {
      const res = await fetch('/api/syllabus/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: teacher.school_id, class_id: selectedClassId, subject: selectedSubject }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPublishedMsg(`Syllabus published — ${data.published} topics now visible to teachers`)
      setLoadMsg('')
      await loadSyllabus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish')
    } finally {
      setPublishing(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const hasDraft = chapters.some(ch => ch.topics.some(t => !t.published))
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
      <div className="rounded-2xl border p-6 text-center" style={{ background: '#FCEBDB', borderColor: GOLD }}>
        <p className="font-medium" style={{ color: '#8A4B12' }}>No classes assigned yet.</p>
        <p className="text-sm mt-1" style={{ color: '#8A4B12', opacity: 0.75 }}>Ask the school admin to assign classes to your HOD profile.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 sm:p-6" style={{ background: CREAM }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: GOLD, color: 'white' }}>HOD</span>
            <h2 className="font-bold text-xl flex items-center gap-2" style={{ color: INK }}>
              <BookOpen size={19} style={{ color: GOLD }} /> Syllabus Management
            </h2>
          </div>
          {/* 1d: Subject pill selector */}
          {allSubjects.length === 1 ? (
            <span className="text-sm font-semibold px-3 py-1 rounded-full border" style={{ color: GOLD, background: '#FCEBDB', borderColor: GOLD }}>
              {selectedSubject}
            </span>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {allSubjects.map(subj => {
                const active = selectedSubject === subj
                return (
                  <button key={subj} onClick={() => setSelectedSubject(subj)}
                    data-testid={`subject-pill-${subj}`}
                    className="text-sm font-semibold px-3 py-1 rounded-full border transition-colors"
                    style={{ background: active ? GOLD : '#FCEBDB', color: active ? 'white' : '#8A4B12', borderColor: GOLD }}>
                    {subj}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setLoadPdfOpen(v => !v); setPdfMsg('') }}
            disabled={!selectedClassId}
            data-testid="hod-load-pdf-toggle"
            className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: GREEN }}>
            <Upload size={16} />
            Load Syllabus from PDF
          </button>
          <button
            onClick={() => { setShowAddChapter(v => !v); setNewChapterName('') }}
            data-testid="hod-add-chapter-toggle"
            className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-colors"
            style={{ background: GOLD }}>
            <Plus size={16} />
            Add Chapter
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl text-sm flex justify-between px-4 py-3" style={{ background: '#FCEBEB', color: '#791F1F' }}>
          {error}
          <button onClick={() => setError('')} data-testid="hod-error-dismiss" className="ml-4 opacity-60 hover:opacity-100"><X size={15} /></button>
        </div>
      )}

      {loadMsg && (
        <div className="mb-4 rounded-xl text-sm flex items-center justify-between gap-3 px-4 py-3" style={{ background: '#FCEBDB', color: '#8A4B12' }}>
          <span>{loadMsg}</span>
          <button onClick={() => setLoadMsg('')} data-testid="hod-loadmsg-dismiss" className="flex-shrink-0 opacity-60 hover:opacity-100"><X size={15} /></button>
        </div>
      )}

      {publishedMsg && (
        <div className="mb-4 rounded-xl text-sm flex items-center justify-between gap-3 px-4 py-3" style={{ background: '#E1F5EE', color: '#085041' }}>
          <span>{publishedMsg}</span>
          <button onClick={() => setPublishedMsg('')} data-testid="hod-publishedmsg-dismiss" className="flex-shrink-0 opacity-60 hover:opacity-100"><X size={15} /></button>
        </div>
      )}

      {/* Inline PDF syllabus loader */}
      {loadPdfOpen && (
        <div className="mb-5 rounded-2xl p-5 border" style={{ background: 'white', borderColor: GREEN }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-sm" style={{ color: INK }}>Load {selectedSubject} Syllabus from PDF</p>
              <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>
                Upload the textbook PDF — AI will read it and automatically create chapters and topics as a draft syllabus.
                AI also stores the book content to improve homework suggestions and student Q&amp;A.
              </p>
            </div>
            <button onClick={() => { setLoadPdfOpen(false); setPdfMsg(''); setPdfFile(null) }}
              data-testid="hod-load-pdf-close"
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"><X size={17} /></button>
          </div>

          <label className="flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-4 cursor-pointer transition-colors mb-3"
            style={{ borderColor: GREEN, background: pdfUploading ? SURFACE : 'white' }}>
            <FileText size={30} style={{ color: GREEN, opacity: 0.5, flexShrink: 0 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: INK }}>{pdfFile ? pdfFile.name : 'Click to select PDF textbook'}</p>
              <p className="text-xs text-gray-500 mt-0.5">PDF only · text-based (not scanned image) · max 50 MB</p>
            </div>
            <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" data-testid="hod-pdf-file-input"
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setPdfFile(e.target.files?.[0] ?? null); setPdfMsg('') }} />
          </label>

          {pdfUploading && (
            <ProgressBar pct={pdfProgress} color={GREEN} className="w-full mb-3" />
          )}

          {pdfMsg && (
            <p className="text-sm mb-3 px-3 py-2 rounded-lg" style={pdfMsg.startsWith('Error') ? { background: '#FCEBEB', color: '#791F1F' } : { background: '#E1F5EE', color: '#085041' }}>
              {pdfMsg}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button onClick={loadFromPDF} disabled={!pdfFile || pdfUploading}
              data-testid="hod-pdf-upload-btn"
              className="text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              style={{ background: GREEN }}>
              {pdfUploading ? `Analysing PDF… ${pdfProgress}%` : 'Upload & Generate Syllabus'}
            </button>
            <p className="text-xs" style={{ color: GREEN }}>AI will extract chapters and topics — you review, then publish</p>
          </div>
        </div>
      )}

      {hasDraft && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3 border" style={{ background: '#FCEBDB', borderColor: GOLD }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#8A4B12' }}>Draft syllabus — not visible to teachers yet</p>
            <p className="text-xs mt-0.5" style={{ color: '#8A4B12', opacity: 0.8 }}>Review the topics below, then publish to make them visible.</p>
          </div>
          <button
            onClick={publishSyllabus}
            disabled={publishing}
            data-testid="hod-publish-btn"
            className="flex-shrink-0 px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{ background: GOLD }}>
            {publishing ? 'Publishing…' : 'Publish Syllabus'}
          </button>
        </div>
      )}

      {/* Class selector */}
      {classes.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {classes.map(c => {
            const active = selectedClassId === c.id
            return (
              <button key={c.id} onClick={() => setSelectedClassId(c.id)}
                data-testid={`hod-class-${c.id}`}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                style={{ background: active ? GOLD : 'white', color: active ? 'white' : INK, borderColor: active ? GOLD : BORDER }}>
                Grade {c.grade}-{c.section}
              </button>
            )
          })}
        </div>
      )}
      {classes.length === 1 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-400">Class:</span>
          <span className="text-sm font-semibold px-3 py-1 rounded-lg" style={{ color: INK, background: SURFACE }}>
            Grade {classes[0].grade}-{classes[0].section}
          </span>
        </div>
      )}

      {/* Stats */}
      {totalTopics > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Topics', value: totalTopics, color: INK },
            { label: 'Taught', value: coveredTopics, color: GREEN },
            { label: 'Behind Schedule', value: behindTopics, color: CORAL },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border px-4 py-3 text-center bg-white" style={{ borderColor: BORDER }}>
              <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI Homework Suggestion */}
      <div ref={suggestionRef}>
        {suggestLoading && (
          <div className="mb-4 rounded-2xl px-5 py-4 flex items-center gap-3 border" style={{ background: '#FCEBDB', borderColor: GOLD }}>
            <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: GOLD }} />
            <p className="text-sm" style={{ color: '#8A4B12' }}>Generating AI homework suggestion...</p>
          </div>
        )}
        {suggestError && !suggestLoading && (
          <div className="mb-4 rounded-2xl px-5 py-3 flex items-center justify-between" style={{ background: '#FCEBEB' }}>
            <p className="text-sm" style={{ color: '#791F1F' }}>AI suggestion failed. Add homework manually from the Homework tab.</p>
            <button onClick={() => setSuggestError(false)} data-testid="hod-suggest-error-dismiss" className="ml-4 opacity-60 hover:opacity-100" style={{ color: '#791F1F' }}><X size={16} /></button>
          </div>
        )}
        {suggestion && !suggestLoading && (
          <div className="mb-5 rounded-2xl px-5 py-4 border" style={{ background: '#FCEBDB', borderColor: GOLD }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1.5" style={{ color: '#8A4B12' }}>
                  <Sparkles size={12} /> AI Homework Suggestion
                </p>
                <p className="font-semibold text-sm" style={{ color: INK }}>{suggestion.title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: '#4b5563' }}>{suggestion.instructions}</p>
                <div className="flex gap-3 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#8A4B12', background: 'white' }}>{suggestion.estimated_time_minutes} min</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#8A4B12', background: 'white' }}>{suggestion.max_marks} marks</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button onClick={assignHomework} disabled={assigning}
                  data-testid="hod-assign-homework-btn"
                  className="px-4 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: GOLD }}>
                  {assigning ? 'Assigning...' : 'Assign to All'}
                </button>
                <button onClick={() => setSuggestion(null)} data-testid="hod-suggest-dismiss"
                  className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50" style={{ borderColor: BORDER, color: '#6b7280' }}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
        {assignedMsg && (
          <div className="mb-4 rounded-2xl px-5 py-3 flex items-center justify-between" style={{ background: '#E1F5EE' }}>
            <p className="text-sm font-medium" style={{ color: '#085041' }}>{assignedMsg}</p>
            <button onClick={() => setAssignedMsg('')} data-testid="hod-assignedmsg-dismiss" className="opacity-60 hover:opacity-100" style={{ color: '#085041' }}><X size={16} /></button>
          </div>
        )}
      </div>

      {/* Add chapter form */}
      {showAddChapter && (
        <div className="mb-5 rounded-2xl p-4 border" style={{ background: 'white', borderColor: GOLD }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#8A4B12' }}>New Chapter</p>
          <div className="flex gap-2">
            <input
              value={newChapterName}
              onChange={e => setNewChapterName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && stageChapter()}
              placeholder="Chapter name, e.g. Quadratic Equations"
              autoFocus
              data-testid="hod-new-chapter-name"
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2"
              style={{ borderColor: BORDER }}
            />
            <button onClick={stageChapter} disabled={!newChapterName.trim()}
              data-testid="hod-stage-chapter-btn"
              className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: GOLD }}>
              Next →
            </button>
            <button onClick={() => { setShowAddChapter(false); setNewChapterName('') }}
              data-testid="hod-cancel-add-chapter-btn"
              className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" style={{ borderColor: BORDER, color: '#6b7280' }}>
              Cancel
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: GOLD }}>You&apos;ll add topics in the next step</p>
        </div>
      )}

      {/* Syllabus content */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 size={22} className="animate-spin mx-auto mb-3" style={{ color: GOLD }} />
          <p className="text-gray-400 text-sm">Loading syllabus...</p>
        </div>
      ) : visibleChapters.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed py-14 text-center px-6" style={{ borderColor: BORDER }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: '#FCEBDB' }}>
            <BookOpen size={22} style={{ color: GOLD }} />
          </div>
          <p className="font-medium mb-1" style={{ color: INK }}>No syllabus yet for this class</p>
          <div className="space-y-2 mt-3">
            <button onClick={() => { setLoadPdfOpen(true); setPdfMsg('') }}
              data-testid="hod-empty-load-pdf-btn"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold transition-colors" style={{ background: GREEN }}>
              <Upload size={16} />
              Load Syllabus from PDF
            </button>
            <p className="text-gray-400 text-xs">or click <strong>Add Chapter</strong> to build manually</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleChapters.map((ch, chIdx) => {
            const isStaged = 'staged' in ch && ch.staged === true
            const isExpanded = expandedChapter === ch.chapter_name
            const pct = ch.total > 0 ? Math.round(100 * ch.covered / ch.total) : 0

            const chapterHasDraft = !isStaged && 'topics' in ch && ch.topics.some((t: Topic) => !t.published)

            return (
              <div key={ch.chapter_name} className="bg-white rounded-2xl border overflow-hidden"
                style={{ borderColor: isStaged ? GOLD : chapterHasDraft ? GOLD : BORDER }}>
                {/* Chapter header */}
                <div className="flex items-center">
                <button
                  onClick={() => setExpandedChapter(isExpanded ? null : ch.chapter_name)}
                  data-testid={`hod-chapter-toggle-${chIdx}`}
                  className="flex-1 px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: isStaged || chapterHasDraft ? '#FCEBDB' : SURFACE, color: isStaged || chapterHasDraft ? '#8A4B12' : INK }}>
                    {chIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" style={{ color: INK }}>{ch.chapter_name}</span>
                      {isStaged && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#FCEBDB', color: '#8A4B12' }}>
                          Add topics to save
                        </span>
                      )}
                      {chapterHasDraft && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#FCEBDB', color: '#8A4B12' }}>DRAFT</span>
                      )}
                      {'behind' in ch && ch.behind > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                          {ch.behind} behind
                        </span>
                      )}
                    </div>
                    {!isStaged && (
                      <div className="flex items-center gap-3 mt-1">
                        <ProgressBar pct={pct} color={pct === 100 ? GREEN : 'behind' in ch && ch.behind > 0 ? CORAL : GOLD} className="flex-1 max-w-[140px]" />
                        <span className="text-xs text-gray-400">{ch.covered}/{ch.total} taught</span>
                      </div>
                    )}
                  </div>
                  <ChevronDown size={16} className="text-gray-400 flex-shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }} />
                </button>
                {!isStaged && (
                  <button onClick={() => deleteChapter(ch.chapter_name)} title="Delete chapter"
                    data-testid={`hod-delete-chapter-${chIdx}`}
                    className="px-3 py-4 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
                </div>

                {/* Topics */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: BORDER }}>
                    {!isStaged && ch.topics.length === 0 && (
                      <p className="px-6 py-3 text-sm text-gray-400 italic">No topics yet — add one below</p>
                    )}

                    {'topics' in ch && ch.topics.map((topic, tIdx) => {
                      const isBehind = topic.status !== 'covered' && topic.target_date && topic.target_date < today
                      const isSaving = saving === topic.id
                      const qCount = questionCount(topic.questions)

                      return (
                        <div key={topic.id} className="px-5 py-3 border-b last:border-b-0"
                          style={{ borderColor: SURFACE, background: isBehind ? '#FCEBEB40' : undefined }}>
                          <div className="flex items-start gap-3">
                            {/* Mark taught toggle */}
                            <button
                              onClick={() => coverTopic(topic, ch.chapter_name)}
                              disabled={isSaving}
                              title={topic.status === 'covered' ? 'Mark as pending' : 'Mark taught'}
                              data-testid={`hod-mark-taught-${topic.id}`}
                              className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                              style={{
                                background: topic.status === 'covered' ? GREEN : 'white',
                                borderColor: topic.status === 'covered' ? GREEN : isBehind ? CORAL : GOLD,
                                opacity: isSaving ? 0.4 : 1,
                              }}>
                              {topic.status === 'covered' && <Check size={12} className="text-white" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gray-300">{tIdx + 1}.</span>
                                <span className="text-sm font-medium" style={{ color: topic.status === 'covered' ? '#9ca3af' : INK, textDecoration: topic.status === 'covered' ? 'line-through' : undefined }}>
                                  {topic.topic_name}
                                </span>
                                <StatusPill status={topic.status === 'covered' ? 'taught' : 'unlocked'} />
                                <QuizPill count={qCount} />
                                <button
                                  onClick={() => setActiveTopic(topic)}
                                  data-testid={`hod-view-material-${topic.id}`}
                                  className="text-[10px] px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 ml-1"
                                  style={{ color: GOLD, background: '#FCEBDB', border: `1px solid ${GOLD}` }}
                                >
                                  <Eye size={11} /> View Material
                                </button>
                                {isBehind && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#FCEBEB', color: '#791F1F' }}>Behind</span>}
                                {topic.status === 'covered' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#085041' }}>
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
                                      data-testid={`hod-target-date-input-${topic.id}`}
                                      className="border rounded px-1.5 py-0.5 text-xs focus:outline-none" style={{ borderColor: GOLD }} />
                                    <button onClick={async () => { await patchTopic(topic.id, { target_date: editVal || null }); setEditingTarget(null) }}
                                      data-testid={`hod-target-date-save-${topic.id}`}
                                      className="text-xs font-medium" style={{ color: GOLD }}>Save</button>
                                    <button onClick={() => setEditingTarget(null)} data-testid={`hod-target-date-cancel-${topic.id}`} className="text-xs text-gray-400">✕</button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { setEditingTarget(topic.id); setEditVal(topic.target_date || '') }}
                                    data-testid={`hod-target-date-btn-${topic.id}`}
                                    className="text-xs px-2 py-0.5 rounded-full border transition-colors"
                                    style={topic.target_date
                                      ? (isBehind ? { background: '#FCEBEB', color: '#791F1F', borderColor: '#F0999B' } : { background: '#FCEBDB', color: '#8A4B12', borderColor: GOLD })
                                      : { background: SURFACE, color: '#9ca3af', borderColor: BORDER }}>
                                    {topic.target_date || 'Set date'}
                                  </button>
                                )}

                                {(isBehind || topic.delay_reason) && (
                                  <>
                                    <span className="text-[10px]" style={{ color: '#791F1F' }}>Delay:</span>
                                    {editingDelay === topic.id ? (
                                      <span className="flex items-center gap-1">
                                        <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                          placeholder="Reason for delay..."
                                          data-testid={`hod-delay-reason-input-${topic.id}`}
                                          className="border rounded px-1.5 py-0.5 text-xs w-40 focus:outline-none" style={{ borderColor: '#F0999B' }} />
                                        <button onClick={async () => { await patchTopic(topic.id, { delay_reason: editVal }); setEditingDelay(null) }}
                                          data-testid={`hod-delay-reason-save-${topic.id}`}
                                          className="text-xs font-medium" style={{ color: '#791F1F' }}>Save</button>
                                        <button onClick={() => setEditingDelay(null)} data-testid={`hod-delay-reason-cancel-${topic.id}`} className="text-xs text-gray-400">✕</button>
                                      </span>
                                    ) : (
                                      <button onClick={() => { setEditingDelay(topic.id); setEditVal(topic.delay_reason || '') }}
                                        data-testid={`hod-delay-reason-btn-${topic.id}`}
                                        className="text-xs underline decoration-dotted" style={{ color: '#791F1F' }}>
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
                                      data-testid={`hod-remark-input-${topic.id}`}
                                      className="border rounded px-1.5 py-0.5 text-xs w-44 focus:outline-none" style={{ borderColor: GOLD }} />
                                    <button onClick={async () => { await patchTopic(topic.id, { hod_remark: editVal, hod_remark_by: teacher.id }); setEditingRemark(null) }}
                                      data-testid={`hod-remark-save-${topic.id}`}
                                      className="text-xs font-medium" style={{ color: '#8A4B12' }}>Save</button>
                                    <button onClick={() => setEditingRemark(null)} data-testid={`hod-remark-cancel-${topic.id}`} className="text-xs text-gray-400">✕</button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setEditingRemark(topic.id); setEditVal(topic.hod_remark || '') }}
                                    data-testid={`hod-remark-btn-${topic.id}`}
                                    className="text-xs underline decoration-dotted" style={{ color: '#8A4B12' }}>
                                    {topic.hod_remark ? `"${topic.hod_remark}"` : 'Add note'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Delete topic */}
                            <button onClick={() => deleteTopic(topic.id)} title="Remove topic"
                              data-testid={`hod-delete-topic-${topic.id}`}
                              className="text-gray-200 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Add topic form */}
                    {addTopicChapter === ch.chapter_name ? (
                      <div className="px-5 py-3 border-t" style={{ background: SURFACE, borderColor: BORDER }}>
                        {isStaged && (
                          <p className="text-xs font-medium mb-2" style={{ color: GOLD }}>
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
                            data-testid={`hod-new-topic-name-${ch.chapter_name}`}
                            className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2"
                            style={{ borderColor: BORDER }}
                          />
                          <input
                            type="date"
                            value={newTopicTarget}
                            onChange={e => setNewTopicTarget(e.target.value)}
                            title="Target completion date"
                            data-testid={`hod-new-topic-target-${ch.chapter_name}`}
                            className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2"
                            style={{ borderColor: BORDER }}
                          />
                          <button onClick={addTopic} disabled={addingTopic || !newTopicName.trim()}
                            data-testid="hod-add-topic-submit"
                            className="px-3 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: GOLD }}>
                            {addingTopic ? 'Adding...' : 'Add Topic'}
                          </button>
                          <button onClick={() => {
                            if (isStaged) cancelStagedChapter()
                            else { setAddTopicChapter(null); setNewTopicName(''); setNewTopicTarget('') }
                          }}
                            data-testid="hod-add-topic-cancel"
                            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-100" style={{ borderColor: BORDER, color: '#6b7280' }}>
                            {isStaged ? 'Discard chapter' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : !isStaged ? (
                      <button
                        onClick={() => { setAddTopicChapter(ch.chapter_name); setNewTopicName(''); setNewTopicTarget(''); setExpandedChapter(ch.chapter_name) }}
                        data-testid={`hod-add-topic-link-${chIdx}`}
                        className="w-full px-5 py-2.5 text-left text-xs transition-colors flex items-center gap-1.5 border-t"
                        style={{ color: GOLD, borderColor: SURFACE }}>
                        <Plus size={14} />
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

      {/* Premium Content Viewer Modal */}
      {activeTopic && (
        <TopicContentViewer
          topic={activeTopic}
          onClose={() => setActiveTopic(null)}
          role="teacher"
        />
      )}

      <Toast message={toast} />
    </div>
  )
}
