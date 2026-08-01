'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BookOpen, Plus, Pencil, X, Upload, ChevronRight, FileText, Sparkles,
  HelpCircle, CheckCircle2, Layers, ArrowLeft, Trash2, Check,
} from 'lucide-react'
import { INK, TEAL, CREAM, GREEN, PURPLE, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { BulkImportPanel } from '@/app/components/ulearn/BulkImportPanel'
import { Toast } from '@/app/components/ulearn/primitives'
import { useToast } from '@/app/components/ulearn/useToast'
import { syllabusPrompt, SYLLABUS_EXAMPLE } from '@/lib/syllabus/chatgpt-prompt'

type Subject = {
  id: number
  board: string
  grade: string
  subject_name: string
  created_at: string
  category?: 'academic' | 'extra'
}

type Chapter = {
  id: number
  subject_id: number
  chapter_name: string
  chapter_order: number
  description: string
  topics?: Topic[]
  tasks?: Task[]
}

type Topic = {
  id: number
  chapter_id: number
  topic_name: string
  topic_order: number
  content_text: string
  content_pdf_url: string
  resources?: Resource[]
  questions?: { q: string; options: string[]; answer: number }[]
}

type Resource = {
  id: number
  topic_id: number
  resource_type: 'video' | 'image' | 'gdoc' | 'url' | 'pdf'
  title: string
  url: string
}

type Task = {
  id: number
  chapter_id: number
  topic_id: number | null
  title: string
  instructions: string
  task_type: 'homework' | 'test' | 'worksheet'
  max_marks: number
  is_mandatory: boolean
}

const BOARDS = [
  { key: 'CBSE', label: 'CBSE (Central Board)' },
  { key: 'AP_SSC', label: 'AP SSC (Andhra Pradesh)' },
  { key: 'TS_SSC', label: 'TS SSC (Telangana)' },
]

const GRADES = ['6', '7', '8', '9', '10']

// Extra Subjects (Dance, Music, Art, ...) use the identical
// subject→chapter→topic structure as academic ones, filed under a fixed
// pseudo-board so the existing UNIQUE(board, grade, subject_name) and every
// board-scoped query keep working unchanged — "EXTRA" is invisible to the
// user, who only ever sees the category tab.
const EXTRA_BOARD = 'EXTRA'

export default function PlatformCurriculum() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [category, setCategory] = useState<'academic' | 'extra'>('academic')
  const [selectedBoard, setSelectedBoard] = useState('CBSE')
  const [selectedGrade, setSelectedGrade] = useState('10')
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [newSubjectForm, setNewSubjectForm] = useState({ subject_name: '' })

  const [showChapterModal, setShowChapterModal] = useState(false)
  const [newChapterForm, setNewChapterForm] = useState({ chapter_name: '', description: '' })

  // Bulk JSON import (prototype feature) — writes chapters + topics + inline
  // quizzes to the master library via /api/platform/syllabus/bulk-import.
  const [showBulk, setShowBulk] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [importing, setImporting] = useState(false)

  const [activeChapterId, setActiveChapterId] = useState<number | null>(null)
  const [editingTopic, setEditingTopic] = useState<{
    id?: number
    chapter_id: number
    topic_name: string
    topic_order: number
    content_text: string
    content_pdf_url: string
    resources: { id?: number; topic_id?: number; resource_type: 'video' | 'image' | 'gdoc' | 'url' | 'pdf'; title: string; url: string }[]
    questions: { q: string; options: string[]; answer: number }[]
  } | null>(null)
  const [topicEditorTab, setTopicEditorTab] = useState<'general' | 'study_guide' | 'textbook' | 'media' | 'questions' | 'preview'>('general')
  const [newResourceForm, setNewResourceForm] = useState({ resource_type: 'video', title: '', url: '' })

  // Upload states
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    instructions: '',
    task_type: 'homework' as 'homework' | 'test' | 'worksheet',
    max_marks: 10,
    is_mandatory: false,
    topic_id: '',
  })

  const { toast, flash, copyPrompt } = useToast()

  // Load master subjects
  const loadSubjects = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const board = category === 'extra' ? EXTRA_BOARD : selectedBoard
      const res = await fetch(`/api/platform/subjects?board=${board}&grade=${selectedGrade}&category=${category}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = data.subjects || []
      setSubjects(list)
      if (list.length > 0) {
        const found = list.find((s: Subject) => s.id === activeSubject?.id)
        setActiveSubject(found || list[0])
      } else {
        setActiveSubject(null)
        setChapters([])
      }
    } catch {
      setError('Failed to fetch subjects.')
    } finally {
      setLoading(false)
    }
  }, [category, selectedBoard, selectedGrade, activeSubject?.id])

  useEffect(() => {
    loadSubjects()
  }, [loadSubjects])

  // Load subject chapters, topics, and tasks
  const loadSubjectDetails = useCallback(async () => {
    if (!activeSubject) return
    setLoadingDetails(true)
    setError('')
    try {
      const chapsRes = await fetch(`/api/platform/subjects/${activeSubject.id}/chapters`)
      const chapsData = await chapsRes.json()
      if (!chapsRes.ok) throw new Error(chapsData.error)

      const fullChapters: Chapter[] = []
      for (const chap of chapsData) {
        const topicsRes = await fetch(`/api/platform/chapters/${chap.id}/topics`)
        const topicsData = await topicsRes.json()
        const tasksRes = await fetch(`/api/platform/chapters/${chap.id}/tasks`)
        const tasksData = await tasksRes.json()
        fullChapters.push({ ...chap, topics: topicsData, tasks: tasksData })
      }
      setChapters(fullChapters.sort((a, b) => a.chapter_order - b.chapter_order))
    } catch {
      setError('Failed to load syllabus details.')
    } finally {
      setLoadingDetails(false)
    }
  }, [activeSubject])

  useEffect(() => {
    loadSubjectDetails()
  }, [loadSubjectDetails])

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubjectForm.subject_name.trim()) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/platform/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board: category === 'extra' ? EXTRA_BOARD : selectedBoard,
          grade: selectedGrade,
          subject_name: newSubjectForm.subject_name.trim(),
          category,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Subject created successfully!')
      setShowSubjectModal(false)
      setNewSubjectForm({ subject_name: '' })
      loadSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject.')
    }
  }

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSubject || !newChapterForm.chapter_name.trim()) return
    setError('')
    setSuccess('')
    try {
      const order = chapters.length + 1
      const res = await fetch(`/api/platform/subjects/${activeSubject.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_name: newChapterForm.chapter_name.trim(),
          chapter_order: order,
          description: newChapterForm.description.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Chapter created successfully!')
      setShowChapterModal(false)
      setNewChapterForm({ chapter_name: '', description: '' })
      loadSubjectDetails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chapter.')
    }
  }

  // Bulk import: POST the pasted JSON to the transactional route, then refresh.
  const handleBulkImport = async (json: string, mode: 'append' | 'replace') => {
    if (!activeSubject) return
    setBulkError('')
    setImporting(true)
    try {
      const res = await fetch('/api/platform/syllabus/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: activeSubject.id, mode, json }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setShowBulk(false)
      flash(`Imported ${data.chapters} chapter${data.chapters === 1 ? '' : 's'}` +
        (data.questions ? ` + ${data.questions} quiz questions` : '') + ` (${mode}).`)
      loadSubjectDetails()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleAddResource = () => {
    if (!newResourceForm.title.trim() || !newResourceForm.url.trim()) return
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        return {
          ...prev,
          resources: [
            ...prev.resources,
            {
              resource_type: newResourceForm.resource_type as 'video' | 'image' | 'gdoc' | 'url' | 'pdf',
              title: newResourceForm.title.trim(),
              url: newResourceForm.url.trim(),
            },
          ],
        }
      })
    }
    setNewResourceForm({ resource_type: 'video', title: '', url: '' })
  }

  const handleRemoveResource = (index: number) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        return { ...prev, resources: prev.resources.filter((_, i) => i !== index) }
      })
    }
  }

  // File Upload to Cloudinary using XMLHttpRequest for tracking upload progress
  const handleUploadFile = async (file: File, folder: string = 'curriculum-resources') => {
    if (!file) return null
    setUploading(true)
    setUploadProgress(0)
    setUploadError('')
    try {
      const signRes = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData?.error || 'Failed to get upload signature')
      const { signature, timestamp, cloud_name, api_key } = signData

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('folder', folder)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`)
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText))
          else reject(new Error('Cloudinary upload request failed'))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(formData)
      })
      return uploadResult.secure_url as string
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      return null
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const insertMarkdown = (syntax: string) => {
    const textarea = document.getElementById('guide-textarea') as HTMLTextAreaElement
    if (!textarea || !editingTopic) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = editingTopic.content_text
    const before = text.substring(0, start)
    const after = text.substring(end, text.length)
    const newContent = before + syntax + after
    setEditingTopic(prev => prev ? { ...prev, content_text: newContent } : null)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + syntax.length, start + syntax.length)
    }, 0)
  }

  const handleAddQuestion = () => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = prev.questions || []
        return { ...prev, questions: [...currentQuestions, { q: '', options: ['', '', '', ''], answer: 0 }] }
      })
    }
  }

  const handleUpdateQuestion = (qIdx: number, field: 'q' | 'answer', value: string | number) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = [...(prev.questions || [])]
        if (currentQuestions[qIdx]) currentQuestions[qIdx] = { ...currentQuestions[qIdx], [field]: value }
        return { ...prev, questions: currentQuestions }
      })
    }
  }

  const handleUpdateQuestionOption = (qIdx: number, oIdx: number, value: string) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = [...(prev.questions || [])]
        if (currentQuestions[qIdx]) {
          const currentOptions = [...currentQuestions[qIdx].options]
          currentOptions[oIdx] = value
          currentQuestions[qIdx] = { ...currentQuestions[qIdx], options: currentOptions }
        }
        return { ...prev, questions: currentQuestions }
      })
    }
  }

  const handleRemoveQuestion = (qIdx: number) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        return { ...prev, questions: (prev.questions || []).filter((_, i) => i !== qIdx) }
      })
    }
  }

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTopic || !editingTopic.topic_name.trim()) return
    setError('')
    setSuccess('')
    try {
      const targetChapterId = editingTopic.chapter_id
      const payload = {
        id: editingTopic.id,
        topic_name: editingTopic.topic_name.trim(),
        topic_order: editingTopic.topic_order || 1,
        content_text: editingTopic.content_text.trim(),
        content_pdf_url: editingTopic.content_pdf_url.trim(),
        resources: editingTopic.resources,
        questions: editingTopic.questions || [],
      }
      const res = await fetch(`/api/platform/chapters/${targetChapterId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(editingTopic.id ? 'Topic updated successfully!' : 'Topic and resources created successfully!')
      setEditingTopic(null)
      loadSubjectDetails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save topic.')
    }
  }

  const handleDeleteTopic = async (topicId: number, name: string) => {
    if (!confirm(`Are you absolutely sure you want to delete the Master Topic "${name}"?\nThis will permanently delete this topic and all its attachments.`)) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/platform/topics?id=${topicId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete topic')
      setSuccess('Topic deleted successfully.')
      setEditingTopic(null)
      loadSubjectDetails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeChapterId || !newTaskForm.title.trim()) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/platform/chapters/${activeChapterId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskForm.title.trim(),
          instructions: newTaskForm.instructions.trim(),
          task_type: newTaskForm.task_type,
          max_marks: newTaskForm.max_marks,
          is_mandatory: newTaskForm.is_mandatory,
          topic_id: newTaskForm.topic_id ? parseInt(newTaskForm.topic_id) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Master Task added successfully!')
      setShowTaskModal(false)
      setNewTaskForm({ title: '', instructions: '', task_type: 'homework', max_marks: 10, is_mandatory: false, topic_id: '' })
      loadSubjectDetails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    }
  }

  const handleDeleteSubject = async (id: number, name: string) => {
    if (!confirm(`Are you absolutely sure you want to delete the Master Subject "${name}"?\nThis will cascade and delete all Chapters, Topics, and Tasks in this master template.`)) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/platform/subjects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete subject')
      setSuccess('Master subject deleted successfully.')
      loadSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject')
    }
  }

  // ---- shared little styles ----
  const inputCls =
    'w-full bg-white border rounded-xl px-3 py-2 text-sm text-[#0F2A3F] placeholder-gray-400 focus:outline-none focus:ring-2'
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

  return (
    <div className="min-h-screen font-sans" style={{ background: CREAM, color: INK }}>
      {/* Top Header */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm" style={{ borderColor: BORDER }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/platform-admin" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={15} /> Schools
            </Link>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: INK }}>
                <Layers size={17} className="text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: INK }}>Master Syllabus Catalog</div>
                <div className="text-xs text-gray-400">board → grade → subject → chapters → quizzes</div>
              </div>
            </div>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: '#EEEDFE', color: '#3C3489' }}
          >
            Global Template Mode
          </span>
        </div>
      </div>

      {editingTopic ? (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {/* Breadcrumbs and Top Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: BORDER }}>
            <div>
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-1">
                <span>Master Syllabus</span><span>/</span>
                <span style={{ color: PURPLE }}>{activeSubject?.subject_name}</span><span>/</span>
                <span>Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || activeChapterId}</span><span>/</span>
                <span className="font-bold" style={{ color: INK }}>{editingTopic.id ? 'Edit Topic' : 'New Topic'}</span>
              </div>
              <h2 className="text-xl font-semibold" style={{ color: INK }}>
                {editingTopic.topic_name.trim() ? editingTopic.topic_name : 'Untitled Topic'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {editingTopic.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteTopic(editingTopic.id!, editingTopic.topic_name)}
                  className="flex items-center gap-1 border text-sm font-medium px-3 py-2 rounded-xl hover:bg-red-50"
                  style={{ borderColor: '#F0999B', color: '#791F1F' }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="border text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50"
                style={{ borderColor: BORDER, color: INK }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTopic}
                className="text-white text-sm font-semibold px-6 py-2 rounded-xl shadow-sm"
                style={{ background: PURPLE }}
              >
                Save Topic
              </button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="bg-white p-1 rounded-2xl border flex flex-wrap gap-1" style={{ borderColor: BORDER }}>
            {([
              { id: 'general', label: 'General' },
              { id: 'study_guide', label: 'Study Guide' },
              { id: 'textbook', label: 'Textbook' },
              { id: 'media', label: 'Media' },
              { id: 'questions', label: 'Questions' },
              { id: 'preview', label: 'Preview' },
            ] as const).map(tab => {
              const active = topicEditorTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTopicEditorTab(tab.id)}
                  className="flex-1 text-center py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: active ? PURPLE : 'transparent',
                    color: active ? 'white' : '#6b7280',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="bg-white border rounded-3xl p-6 min-h-[400px]" style={{ borderColor: BORDER }}>
            {/* 1. GENERAL */}
            {topicEditorTab === 'general' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-3 space-y-4">
                  <div>
                    <label className={labelCls}>Topic Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Euclid's Division Lemma"
                      required
                      value={editingTopic.topic_name}
                      onChange={e => setEditingTopic(prev => prev ? ({ ...prev, topic_name: e.target.value }) : null)}
                      className={inputCls}
                      style={{ borderColor: BORDER }}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Display Order</label>
                    <input
                      type="number"
                      required
                      value={editingTopic.topic_order}
                      onChange={e => setEditingTopic(prev => prev ? ({ ...prev, topic_order: parseInt(e.target.value) || 0 }) : null)}
                      className={`${inputCls} max-w-[150px] font-mono`}
                      style={{ borderColor: BORDER }}
                    />
                  </div>
                </div>
                <div className="md:col-span-2 rounded-2xl p-5 space-y-3" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b pb-2" style={{ borderColor: BORDER }}>
                    Curriculum Context
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b" style={{ borderColor: '#EFEDE6' }}>
                      <span className="text-gray-400">Board</span>
                      <span className="font-semibold uppercase" style={{ color: INK }}>{activeSubject?.board}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b" style={{ borderColor: '#EFEDE6' }}>
                      <span className="text-gray-400">Grade</span>
                      <span className="font-semibold" style={{ color: INK }}>Grade {activeSubject?.grade}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b" style={{ borderColor: '#EFEDE6' }}>
                      <span className="text-gray-400">Subject</span>
                      <span className="font-semibold" style={{ color: INK }}>{activeSubject?.subject_name}</span>
                    </div>
                    <div className="py-1">
                      <span className="text-gray-400 block mb-1">Parent Chapter</span>
                      <span className="font-semibold text-xs leading-relaxed" style={{ color: PURPLE }}>
                        Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || ''}: {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_name || ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. STUDY GUIDE */}
            {topicEditorTab === 'study_guide' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-8 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Lesson Material & Syllabus Guide</label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {editingTopic.content_text.length} chars | {editingTopic.content_text.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 border p-1.5 rounded-xl" style={{ borderColor: BORDER, background: SURFACE }}>
                    {[
                      { md: '## ', label: 'H2' }, { md: '### ', label: 'H3' },
                      { md: '**text**', label: 'B' }, { md: '*text*', label: 'I' },
                      { md: '\n- ', label: '• List' }, { md: '`code`', label: '</>' },
                    ].map(b => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => insertMarkdown(b.md)}
                        className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-white rounded transition-colors"
                        style={{ background: 'white', border: `1px solid ${BORDER}` }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="guide-textarea"
                    placeholder="Provide direct instruction text, study guide outlines, core vocabulary..."
                    rows={12}
                    value={editingTopic.content_text}
                    onChange={e => setEditingTopic(prev => prev ? ({ ...prev, content_text: e.target.value }) : null)}
                    className={`${inputCls} font-mono leading-relaxed resize-none`}
                    style={{ borderColor: BORDER }}
                  />
                </div>
                <div className="md:col-span-4 rounded-2xl p-5 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b pb-2" style={{ borderColor: BORDER }}>Content Tips</h4>
                  <ul className="space-y-3 text-[11px] text-gray-500 list-disc list-inside leading-relaxed">
                    <li><strong style={{ color: INK }}>Structure with headers</strong> — use <code style={{ color: PURPLE }}>## Title</code> to make it readable.</li>
                    <li><strong style={{ color: INK }}>Formatting</strong> — bold + lists to highlight formulas.</li>
                    <li><strong style={{ color: INK }}>Application</strong> — add a solved example to reinforce learning.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 3. TEXTBOOK */}
            {topicEditorTab === 'textbook' && (
              <div className="max-w-2xl space-y-4">
                <div>
                  <label className={labelCls}>Official Textbook PDF Reference Link (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/textbooks/math-ch1.pdf"
                    value={editingTopic.content_pdf_url}
                    onChange={e => setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: e.target.value }) : null)}
                    className={`${inputCls} font-mono`}
                    style={{ borderColor: BORDER }}
                  />
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    A textbook PDF lets teachers and pupils open the formal chapter scans side-by-side during revision.
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Or upload textbook PDF directly</label>
                  <div className="border border-dashed rounded-2xl p-6 text-center transition-all relative group cursor-pointer" style={{ borderColor: BORDER, background: SURFACE }}>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const url = await handleUploadFile(file, 'textbooks')
                          if (url && editingTopic) setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: url }) : null)
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <div className="space-y-2">
                      <FileText size={22} className="mx-auto" style={{ color: PURPLE }} />
                      {uploading ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold" style={{ color: PURPLE }}>Uploading… {uploadProgress}%</p>
                          <div className="w-48 h-1.5 rounded-full mx-auto overflow-hidden bg-gray-100">
                            <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: PURPLE }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold" style={{ color: INK }}>Drag & drop your PDF, or <span style={{ color: PURPLE }}>browse</span></p>
                          <p className="text-[10px] text-gray-400 mt-1">Supports PDF files up to 10MB</p>
                        </div>
                      )}
                      {uploadError && <p className="text-[10px]" style={{ color: '#791F1F' }}>⚠️ {uploadError}</p>}
                    </div>
                  </div>
                </div>
                {editingTopic.content_pdf_url && (
                  <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#EEEDFE', border: `1px solid #D6D2F0` }}>
                    <div className="text-xs min-w-0">
                      <span className="font-bold block mb-0.5" style={{ color: PURPLE }}>Link attached</span>
                      <span className="text-gray-500 truncate max-w-sm block font-mono text-[10px]">{editingTopic.content_pdf_url}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a href={editingTopic.content_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: PURPLE }}>Test →</a>
                      <button type="button" onClick={() => setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: '' }) : null)} className="text-xs px-3 py-1.5 rounded-lg font-medium border" style={{ borderColor: '#F0999B', color: '#791F1F' }}>Clear</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. MEDIA */}
            {topicEditorTab === 'media' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-3 space-y-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b pb-2" style={{ borderColor: BORDER }}>
                    Current Attachments ({editingTopic.resources.length})
                  </h4>
                  {editingTopic.resources.length === 0 ? (
                    <div className="border border-dashed rounded-2xl py-12 text-center" style={{ borderColor: BORDER }}>
                      <p className="text-xs text-gray-400 font-medium">No media items attached yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editingTopic.resources.map((res, rIdx) => (
                        <div key={rIdx} className="rounded-xl p-3.5 flex items-center justify-between gap-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate" style={{ color: INK }}>{res.title}</span>
                            <span className="text-[9px] text-gray-400 font-mono block truncate max-w-md">{res.url}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 border rounded-lg" style={{ borderColor: BORDER, color: '#6b7280' }}>Open</a>
                            <button type="button" onClick={() => handleRemoveResource(rIdx)} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: '#FCEBEB', color: '#791F1F' }}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2 rounded-2xl p-5 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b pb-2" style={{ borderColor: BORDER }}>Add Attachment</h4>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { type: 'video', label: 'Video' }, { type: 'gdoc', label: 'Doc' },
                      { type: 'pdf', label: 'PDF' }, { type: 'url', label: 'Link' },
                    ] as const).map(item => {
                      const active = newResourceForm.resource_type === item.type
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setNewResourceForm(prev => ({ ...prev, resource_type: item.type }))}
                          className="p-2 rounded-xl text-center border transition-all text-[10px] font-bold uppercase"
                          style={{
                            background: active ? PURPLE : 'white',
                            color: active ? 'white' : '#9ca3af',
                            borderColor: active ? PURPLE : BORDER,
                          }}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="border border-dashed rounded-xl p-5 text-center transition-all relative cursor-pointer" style={{ borderColor: BORDER, background: 'white' }}>
                    <input
                      type="file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const url = await handleUploadFile(file, 'attachments')
                          if (url) {
                            let resourceType: 'video' | 'gdoc' | 'pdf' | 'url' | 'image' = 'url'
                            if (file.type.startsWith('video/')) resourceType = 'video'
                            else if (file.type === 'application/pdf') resourceType = 'pdf'
                            else if (file.type.startsWith('image/')) resourceType = 'image'
                            else if (file.name.includes('doc') || file.type.includes('word') || file.type.includes('document')) resourceType = 'gdoc'
                            setNewResourceForm({ resource_type: resourceType, title: file.name.substring(0, file.name.lastIndexOf('.')) || file.name, url })
                          }
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <Upload size={18} className="mx-auto mb-1" style={{ color: PURPLE }} />
                    {uploading ? (
                      <p className="text-[11px] font-bold" style={{ color: PURPLE }}>Uploading… {uploadProgress}%</p>
                    ) : (
                      <p className="text-[11px] font-bold" style={{ color: INK }}>Upload file, or <span style={{ color: PURPLE }}>browse</span></p>
                    )}
                    {uploadError && <p className="text-[9px]" style={{ color: '#791F1F' }}>⚠️ {uploadError}</p>}
                  </div>
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">Attachment Title</label>
                      <input type="text" placeholder="e.g. Concept Video" value={newResourceForm.title} onChange={e => setNewResourceForm(prev => ({ ...prev, title: e.target.value }))} className={`${inputCls} font-semibold`} style={{ borderColor: BORDER }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">Resource URL</label>
                      <input type="url" placeholder="https://…" value={newResourceForm.url} onChange={e => setNewResourceForm(prev => ({ ...prev, url: e.target.value }))} className={`${inputCls} font-mono`} style={{ borderColor: BORDER }} />
                    </div>
                    <button type="button" onClick={handleAddResource} className="w-full text-white text-xs font-bold py-2 px-3 rounded-xl shadow-sm" style={{ background: PURPLE }}>Attach to Topic →</button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. QUESTIONS */}
            {topicEditorTab === 'questions' && (
              <div className="max-w-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2" style={{ color: INK }}>
                    <HelpCircle size={15} style={{ color: PURPLE }} /> Assessment questions ({editingTopic.questions?.length || 0})
                  </h4>
                  <button type="button" onClick={handleAddQuestion} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white font-medium" style={{ background: PURPLE }}>
                    <Plus size={14} /> Add question
                  </button>
                </div>
                {(!editingTopic.questions || editingTopic.questions.length === 0) ? (
                  <div className="border border-dashed rounded-2xl py-10 text-center text-xs text-gray-400" style={{ borderColor: BORDER }}>
                    No questions yet. Add them here, or bulk-import from the catalog view.
                  </div>
                ) : (
                  editingTopic.questions.map((q, qIdx) => (
                    <div key={qIdx} className="rounded-2xl border p-4 space-y-3" style={{ borderColor: BORDER }}>
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          placeholder={`Question ${qIdx + 1}`}
                          value={q.q}
                          onChange={e => handleUpdateQuestion(qIdx, 'q', e.target.value)}
                          className={`${inputCls} font-medium`}
                          style={{ borderColor: BORDER }}
                        />
                        <button type="button" onClick={() => handleRemoveQuestion(qIdx)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"><X size={14} /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((o, oIdx) => {
                          const correct = q.answer === oIdx
                          return (
                            <div key={oIdx} className="flex items-center gap-2">
                              <button type="button" onClick={() => handleUpdateQuestion(qIdx, 'answer', oIdx)} title="Mark correct"
                                className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                                style={{ borderColor: correct ? GREEN : BORDER, background: correct ? GREEN : 'white' }}>
                                {correct && <Check size={12} className="text-white" />}
                              </button>
                              <input type="text" placeholder={`Option ${oIdx + 1}`} value={o} onChange={e => handleUpdateQuestionOption(qIdx, oIdx, e.target.value)} className={inputCls} style={{ borderColor: correct ? GREEN : BORDER }} />
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-gray-400">Click the circle to mark the correct option.</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 6. PREVIEW */}
            {topicEditorTab === 'preview' && (
              <div className="max-w-xl mx-auto">
                <div className="text-center mb-4">
                  <span className="text-xs text-gray-500 font-medium border px-3 py-1 rounded-full uppercase tracking-wider" style={{ borderColor: BORDER, background: SURFACE }}>
                    Student preview
                  </span>
                </div>
                <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: BORDER }}>
                  <div className="p-6 space-y-4" style={{ background: 'white' }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: PURPLE }}>
                      <span>{activeSubject?.board || 'CBSE'}</span><span>/</span>
                      <span>Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || activeChapterId}</span>
                    </div>
                    <h3 className="text-lg font-semibold leading-tight" style={{ color: INK }}>
                      {editingTopic.topic_name.trim() ? editingTopic.topic_name : 'Untitled Lesson Topic'}
                    </h3>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap rounded-2xl p-4" style={{ background: SURFACE, color: '#334155', border: `1px solid ${BORDER}` }}>
                      {editingTopic.content_text.trim() || <span className="text-gray-400 italic">No guide text yet — add it in the Study Guide tab.</span>}
                    </div>
                    {editingTopic.content_pdf_url && (
                      <a href={editingTopic.content_pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-2xl border" style={{ borderColor: '#D6D2F0', background: '#F6F5FE' }}>
                        <FileText size={20} style={{ color: PURPLE }} />
                        <span className="text-xs font-semibold" style={{ color: INK }}>Coursebook PDF reference</span>
                      </a>
                    )}
                    {editingTopic.resources.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Attached materials</span>
                        {editingTopic.resources.map((res, rIdx) => (
                          <a key={rIdx} href={res.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-2xl border" style={{ borderColor: BORDER, background: SURFACE }}>
                            <span className="text-[11px] font-bold" style={{ color: INK }}>{res.title}</span>
                            <span className="text-[9px] font-bold" style={{ color: PURPLE }}>→</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Template Scope</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Category</label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: SURFACE }}>
                    {(['academic', 'extra'] as const).map(c => {
                      const active = category === c
                      return (
                        <button
                          key={c}
                          onClick={() => setCategory(c)}
                          className="py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{ background: active ? PURPLE : 'transparent', color: active ? 'white' : '#6b7280' }}
                        >
                          {c === 'academic' ? 'Board Subjects' : 'Extra Subjects'}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {category === 'academic' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Academic Board</label>
                  <div className="space-y-1">
                    {BOARDS.map(b => {
                      const active = selectedBoard === b.key
                      return (
                        <button
                          key={b.key}
                          onClick={() => setSelectedBoard(b.key)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all border"
                          style={{
                            background: active ? PURPLE : 'white',
                            color: active ? 'white' : '#6b7280',
                            borderColor: active ? PURPLE : BORDER,
                          }}
                        >
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Grade level</label>
                  <div className="grid grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: SURFACE }}>
                    {GRADES.map(g => {
                      const active = selectedGrade === g
                      return (
                        <button
                          key={g}
                          onClick={() => setSelectedGrade(g)}
                          className="py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{ background: active ? PURPLE : 'transparent', color: active ? 'white' : '#6b7280' }}
                        >
                          {g}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Subjects List */}
            <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Subjects ({subjects.length})</h3>
                <button onClick={() => setShowSubjectModal(true)} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-white" style={{ background: PURPLE }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              {loading ? (
                <div className="py-6 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: PURPLE, borderTopColor: 'transparent' }} />
                </div>
              ) : subjects.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No subjects for this board & grade.</p>
              ) : (
                <div className="space-y-1">
                  {subjects.map(s => {
                    const active = activeSubject?.id === s.id
                    return (
                      <div
                        key={s.id}
                        className="group w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-all border"
                        style={{
                          background: active ? '#F6F5FE' : 'transparent',
                          borderColor: active ? '#D6D2F0' : 'transparent',
                          color: active ? PURPLE : '#6b7280',
                        }}
                      >
                        <button onClick={() => setActiveSubject(s)} className="flex-1 text-left truncate font-medium flex items-center gap-1.5">
                          <BookOpen size={13} /> {s.subject_name}
                        </button>
                        <button onClick={() => handleDeleteSubject(s.id, s.subject_name)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all ml-1 p-0.5" title="Delete subject">
                          <X size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Master Catalog Panel */}
          <div className="lg:col-span-3 space-y-6">
            {error && (
              <div className="px-4 py-3 rounded-xl flex justify-between items-center text-xs" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                <span>⚠️ {error}</span>
                <button onClick={() => setError('')}><X size={13} /></button>
              </div>
            )}
            {success && (
              <div className="px-4 py-3 rounded-xl flex justify-between items-center text-xs" style={{ background: '#E1F5EE', color: '#085041' }}>
                <span>✓ {success}</span>
                <button onClick={() => setSuccess('')}><X size={13} /></button>
              </div>
            )}

            {!activeSubject ? (
              <div className="bg-white border border-dashed rounded-3xl py-24 text-center" style={{ borderColor: BORDER }}>
                <BookOpen size={28} className="mx-auto mb-3" style={{ color: PURPLE }} />
                <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>Select or create a subject</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Define the curriculum template from board subjects, chapters, down to tasks and quizzes.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Subject Card */}
                <div className="bg-white border rounded-3xl p-6" style={{ borderColor: PURPLE }}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: '#EEEDFE', color: '#3C3489' }}>
                        {activeSubject.board} · Grade {activeSubject.grade}
                      </span>
                      <h2 className="text-xl font-semibold mt-2" style={{ color: INK }}>{activeSubject.subject_name}</h2>
                      <p className="text-xs text-gray-400 mt-1">Master syllabus catalog template</p>
                    </div>
                    <div className="flex items-center gap-2 self-start flex-wrap">
                      <button
                        onClick={() => { setShowBulk(v => !v); setBulkError('') }}
                        className="flex items-center gap-1 text-sm font-medium px-3 py-2.5 rounded-xl border hover:bg-gray-50"
                        style={{ borderColor: showBulk ? PURPLE : BORDER, color: showBulk ? PURPLE : INK }}
                      >
                        <Upload size={15} /> Bulk upload JSON
                      </button>
                      <button
                        onClick={() => setShowChapterModal(true)}
                        className="flex items-center gap-1 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm"
                        style={{ background: PURPLE }}
                      >
                        <Plus size={15} /> Add chapter
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bulk import panel */}
                {showBulk && (
                  <BulkImportPanel
                    title={`Bulk import chapters — ${activeSubject.board} · Grade ${activeSubject.grade} · ${activeSubject.subject_name}`}
                    hint='Array of chapters. Each has a "title" and "topics". A topic is a string, or { "title": "...", "quiz": [ …questions ] } to build its quiz in the same upload.'
                    example={SYLLABUS_EXAMPLE}
                    prompt={syllabusPrompt(activeSubject.board, activeSubject.grade, activeSubject.subject_name)}
                    error={bulkError}
                    onClose={() => { setShowBulk(false); setBulkError('') }}
                    onCopyPrompt={copyPrompt}
                    actions={[
                      { label: importing ? 'Importing…' : 'Append', color: TEAL, onClick: (t) => handleBulkImport(t, 'append') },
                      { label: importing ? 'Importing…' : 'Replace all', color: PURPLE, onClick: (t) => handleBulkImport(t, 'replace') },
                    ]}
                  />
                )}

                {/* Chapters */}
                {loadingDetails ? (
                  <div className="py-24 text-center">
                    <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: PURPLE, borderTopColor: 'transparent' }} />
                    <p className="text-xs text-gray-400 font-medium">Loading syllabus template…</p>
                  </div>
                ) : chapters.length === 0 ? (
                  <div className="bg-white border border-dashed rounded-3xl py-16 text-center" style={{ borderColor: BORDER }}>
                    <p className="text-xs text-gray-400 mb-3">No chapters yet — add one, or bulk-import above.</p>
                    <button onClick={() => setShowChapterModal(true)} className="text-xs font-bold hover:underline" style={{ color: PURPLE }}>+ Add first chapter</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chapters.map((ch, idx) => (
                      <div key={ch.id} className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
                        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap pb-4 border-b" style={{ borderColor: '#EFEDE6' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs" style={{ background: '#EEEDFE', color: PURPLE }}>{idx + 1}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PURPLE }}>Ch {ch.chapter_order}</span>
                                <h4 className="text-sm font-semibold" style={{ color: INK }}>{ch.chapter_name}</h4>
                              </div>
                              {ch.description && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{ch.description}</p>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setActiveChapterId(ch.id)
                                setEditingTopic({ chapter_id: ch.id, topic_name: '', topic_order: (ch.topics?.length || 0) + 1, content_text: '', content_pdf_url: '', resources: [], questions: [] })
                                setTopicEditorTab('general')
                              }}
                              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                              style={{ borderColor: BORDER, color: INK }}
                            >
                              <Plus size={12} /> Topic
                            </button>
                            <button
                              onClick={() => { setActiveChapterId(ch.id); setShowTaskModal(true) }}
                              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                              style={{ background: '#EEEDFE', color: PURPLE }}
                            >
                              <Plus size={12} /> Task
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Topics */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Topics</h5>
                            {!ch.topics || ch.topics.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic py-2">No topics added.</p>
                            ) : (
                              <div className="space-y-2">
                                {ch.topics.map(t => (
                                  <div
                                    key={t.id}
                                    onClick={() => {
                                      setActiveChapterId(ch.id)
                                      setEditingTopic({ id: t.id, chapter_id: ch.id, topic_name: t.topic_name, topic_order: t.topic_order, content_text: t.content_text || '', content_pdf_url: t.content_pdf_url || '', resources: t.resources || [], questions: t.questions || [] })
                                      setTopicEditorTab('general')
                                    }}
                                    className="rounded-xl p-3 cursor-pointer transition-all group/topic border"
                                    style={{ background: SURFACE, borderColor: BORDER }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-bold" style={{ color: INK }}>{t.topic_order}. {t.topic_name}</p>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {t.questions && t.questions.length > 0 && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: '#E6F1FB', color: '#0C447C' }}>
                                            <HelpCircle size={9} /> {t.questions.length}
                                          </span>
                                        )}
                                        <span className="text-[10px] font-semibold opacity-0 group-hover/topic:opacity-100 transition-all" style={{ color: PURPLE }}>Edit →</span>
                                      </div>
                                    </div>
                                    {t.content_text && <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{t.content_text}</p>}
                                    {t.content_pdf_url && <p className="text-[10px] truncate mt-1" style={{ color: PURPLE }}>📄 {t.content_pdf_url}</p>}
                                    {t.resources && t.resources.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {t.resources.map(r => (
                                          <span key={r.id} className="text-[9px] border px-2 py-0.5 rounded font-mono truncate max-w-[150px]" style={{ borderColor: BORDER, color: '#6b7280' }} title={`${r.title} (${r.resource_type})`}>
                                            {r.resource_type === 'video' ? '📺' : '🔗'} {r.title}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Tasks */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Exercises & Tasks</h5>
                            {!ch.tasks || ch.tasks.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic py-2">No master tasks added.</p>
                            ) : (
                              <div className="space-y-2">
                                {ch.tasks.map(tsk => (
                                  <div key={tsk.id} className="rounded-xl p-3 flex justify-between items-start gap-2 border" style={{ background: SURFACE, borderColor: BORDER }}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs font-bold truncate" style={{ color: INK }}>{tsk.title}</p>
                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase" style={tsk.is_mandatory ? { background: '#FCEBEB', color: '#791F1F' } : { background: '#FAEEDA', color: '#633806' }}>
                                          {tsk.is_mandatory ? 'Mandatory' : 'Optional'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{tsk.instructions}</p>
                                      <div className="flex gap-2 mt-1.5 text-[9px] text-gray-400">
                                        <span className="px-1.5 py-0.5 rounded border capitalize" style={{ borderColor: BORDER }}>{tsk.task_type}</span>
                                        <span>Max Marks: {tsk.max_marks}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={() => setShowSubjectModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            <h3 className="text-base font-semibold mb-4" style={{ color: INK }}>Create Master Subject</h3>
            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className={labelCls}>Subject Name</label>
                <input type="text" placeholder="e.g. Mathematics" required value={newSubjectForm.subject_name} onChange={e => setNewSubjectForm({ subject_name: e.target.value })} className={inputCls} style={{ borderColor: BORDER }} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSubjectModal(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button type="submit" className="text-white text-xs font-bold px-4 py-2 rounded-xl" style={{ background: PURPLE }}>Create Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChapterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={() => setShowChapterModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            <h3 className="text-base font-semibold mb-4" style={{ color: INK }}>Add Master Chapter</h3>
            <form onSubmit={handleCreateChapter} className="space-y-4">
              <div>
                <label className={labelCls}>Chapter Name</label>
                <input type="text" placeholder="e.g. Real Numbers" required value={newChapterForm.chapter_name} onChange={e => setNewChapterForm(prev => ({ ...prev, chapter_name: e.target.value }))} className={inputCls} style={{ borderColor: BORDER }} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea placeholder="Summary or learning outcomes" rows={3} value={newChapterForm.description} onChange={e => setNewChapterForm(prev => ({ ...prev, description: e.target.value }))} className={`${inputCls} resize-none`} style={{ borderColor: BORDER }} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowChapterModal(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button type="submit" className="text-white text-xs font-bold px-4 py-2 rounded-xl" style={{ background: PURPLE }}>Create Chapter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={() => setShowTaskModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            <h3 className="text-base font-semibold mb-4" style={{ color: INK }}>Add Master Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className={labelCls}>Task Title</label>
                <input type="text" placeholder="e.g. Chapter 1 worksheet" required value={newTaskForm.title} onChange={e => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))} className={inputCls} style={{ borderColor: BORDER }} />
              </div>
              <div>
                <label className={labelCls}>Topic Mapping (Optional)</label>
                <select value={newTaskForm.topic_id} onChange={e => setNewTaskForm(prev => ({ ...prev, topic_id: e.target.value }))} className={inputCls} style={{ borderColor: BORDER }}>
                  <option value="">No topic mapping (chapter-level)</option>
                  {chapters.find(c => c.id === activeChapterId)?.topics?.map(t => (
                    <option key={t.id} value={t.id}>{t.topic_order}. {t.topic_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Instructions / Details</label>
                <textarea placeholder="Task instructions…" rows={3} value={newTaskForm.instructions} onChange={e => setNewTaskForm(prev => ({ ...prev, instructions: e.target.value }))} className={`${inputCls} resize-none`} style={{ borderColor: BORDER }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Task Type</label>
                  <select value={newTaskForm.task_type} onChange={e => setNewTaskForm(prev => ({ ...prev, task_type: e.target.value as 'homework' | 'test' | 'worksheet' }))} className={inputCls} style={{ borderColor: BORDER }}>
                    <option value="homework">Homework</option>
                    <option value="test">Test</option>
                    <option value="worksheet">Worksheet</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Max Marks</label>
                  <input type="number" required value={newTaskForm.max_marks} onChange={e => setNewTaskForm(prev => ({ ...prev, max_marks: parseInt(e.target.value) }))} className={inputCls} style={{ borderColor: BORDER }} />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="is_mandatory_chk" checked={newTaskForm.is_mandatory} onChange={e => setNewTaskForm(prev => ({ ...prev, is_mandatory: e.target.checked }))} className="w-4 h-4 rounded" />
                <label htmlFor="is_mandatory_chk" className="text-xs font-semibold cursor-pointer select-none" style={{ color: INK }}>Mark as government-mandated (required for all schools)</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button type="submit" className="text-white text-xs font-bold px-4 py-2 rounded-xl" style={{ background: PURPLE }}>Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  )
}
