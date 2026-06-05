'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Subject = {
  id: number
  board: string
  grade: string
  subject_name: string
  created_at: string
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
  { key: 'TS_SSC', label: 'TS SSC (Telangana)' }
]

const GRADES = ['6', '7', '8', '9', '10']

export default function PlatformCurriculum() {
  const [subjects, setSubjects] = useState<Subject[]>([])
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

  // Upload and quiz simulation states
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [mockAnswers, setMockAnswers] = useState<Record<number, number>>({})

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    instructions: '',
    task_type: 'homework' as 'homework' | 'test' | 'worksheet',
    max_marks: 10,
    is_mandatory: false,
    topic_id: ''
  })

  // Load master subjects
  const loadSubjects = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/platform/subjects?board=${selectedBoard}&grade=${selectedGrade}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = data.subjects || []
      setSubjects(list)
      if (list.length > 0) {
        // If active subject still matches board/grade, keep it, otherwise switch to first
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
  }, [selectedBoard, selectedGrade, activeSubject?.id])

  useEffect(() => {
    loadSubjects()
  }, [loadSubjects])

  // Load subject chapters, topics, and tasks
  const loadSubjectDetails = useCallback(async () => {
    if (!activeSubject) return
    setLoadingDetails(true)
    setError('')
    try {
      // Get chapters
      const chapsRes = await fetch(`/api/platform/subjects/${activeSubject.id}/chapters`)
      const chapsData = await chapsRes.json()
      if (!chapsRes.ok) throw new Error(chapsData.error)

      const fullChapters: Chapter[] = []

      // For each chapter, load topics and tasks
      for (const chap of chapsData) {
        // Fetch topics
        const topicsRes = await fetch(`/api/platform/chapters/${chap.id}/topics`)
        const topicsData = await topicsRes.json()

        // Fetch tasks
        const tasksRes = await fetch(`/api/platform/chapters/${chap.id}/tasks`)
        const tasksData = await tasksRes.json()

        fullChapters.push({
          ...chap,
          topics: topicsData,
          tasks: tasksData
        })
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
          board: selectedBoard,
          grade: selectedGrade,
          subject_name: newSubjectForm.subject_name.trim()
        })
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
          description: newChapterForm.description.trim()
        })
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
              url: newResourceForm.url.trim()
            }
          ]
        }
      })
    }
    setNewResourceForm({ resource_type: 'video', title: '', url: '' })
  }

  const handleRemoveResource = (index: number) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        return {
          ...prev,
          resources: prev.resources.filter((_, i) => i !== index)
        }
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
      if (!signRes.ok) {
        throw new Error(signData?.error || 'Failed to get upload signature')
      }
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
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
      }

      const uploadResult = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error('Cloudinary upload request failed'))
          }
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

  // Markdown editor insertion helper
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

  // Question Management Helpers
  const handleAddQuestion = () => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = prev.questions || []
        return {
          ...prev,
          questions: [
            ...currentQuestions,
            { q: '', options: ['', '', '', ''], answer: 0 }
          ]
        }
      })
    }
  }

  const handleUpdateQuestion = (qIdx: number, field: 'q' | 'answer', value: any) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = [...(prev.questions || [])]
        if (currentQuestions[qIdx]) {
          currentQuestions[qIdx] = {
            ...currentQuestions[qIdx],
            [field]: value
          }
        }
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
          currentQuestions[qIdx] = {
            ...currentQuestions[qIdx],
            options: currentOptions
          }
        }
        return { ...prev, questions: currentQuestions }
      })
    }
  }

  const handleRemoveQuestion = (qIdx: number) => {
    if (editingTopic) {
      setEditingTopic(prev => {
        if (!prev) return null
        const currentQuestions = (prev.questions || []).filter((_, i) => i !== qIdx)
        return { ...prev, questions: currentQuestions }
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
        questions: editingTopic.questions || []
      }

      const res = await fetch(`/api/platform/chapters/${targetChapterId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      const res = await fetch(`/api/platform/topics?id=${topicId}`, {
        method: 'DELETE'
      })
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
          topic_id: newTaskForm.topic_id ? parseInt(newTaskForm.topic_id) : null
        })
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Top Header */}
      <div className="bg-slate-950/70 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/platform-admin" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Back to Schools
          </Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            <span>📚</span> Master Syllabus Catalog Builder
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-purple-950 text-purple-300 border border-purple-800/60 text-xs font-semibold px-3 py-1 rounded-full">
            Global Template Mode
          </span>
        </div>
      </div>

      {editingTopic ? (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6 animate-fadeIn">
          {/* Breadcrumbs and Top Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <span>📚 Master Syllabus</span>
                <span>/</span>
                <span className="text-purple-400">{activeSubject?.subject_name}</span>
                <span>/</span>
                <span>Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || activeChapterId}</span>
                <span>/</span>
                <span className="text-slate-300 font-bold">{editingTopic.id ? 'Edit Topic' : 'New Topic'}</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>✨</span>
                {editingTopic.topic_name.trim() ? editingTopic.topic_name : 'Untitled Topic'}
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              {editingTopic.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteTopic(editingTopic.id!, editingTopic.topic_name)}
                  className="bg-transparent border border-red-500/25 hover:bg-red-500/10 text-red-400 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                >
                  Delete Topic
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-2 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTopic}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-black px-6 py-2 rounded-xl transition-all shadow-lg shadow-purple-500/20"
              >
                Save Topic
              </button>
            </div>
          </div>

          {/* Premium Glassmorphic Tab Selector Navigation */}
          <div className="bg-slate-950/55 p-1 rounded-2xl border border-slate-800/60 backdrop-blur-md flex flex-wrap gap-1">
            {([
              { id: 'general', label: '🏷️ General Settings' },
              { id: 'study_guide', label: '📝 Study Guide Content' },
              { id: 'textbook', label: '📖 Textbook Reference' },
              { id: 'media', label: '📎 Attachments & Media' },
              { id: 'questions', label: '❓ Assessment Questions' },
              { id: 'preview', label: '✨ Live Simulation Preview' }
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTopicEditorTab(tab.id)}
                className={`flex-1 text-center py-2.5 rounded-xl text-xs font-bold transition-all ${
                  topicEditorTab === tab.id
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Pages content containers */}
          <div className="bg-slate-950/30 border border-slate-800/70 rounded-3xl p-6 min-h-[400px] backdrop-blur-lg">
            
            {/* 1. GENERAL SETTINGS */}
            {topicEditorTab === 'general' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 animate-fadeIn">
                <div className="md:col-span-3 space-y-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 mb-2 uppercase tracking-wider">Topic Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Euclid's Division Lemma, Photosynthesis Basics"
                      required
                      value={editingTopic.topic_name}
                      onChange={e => setEditingTopic(prev => prev ? ({ ...prev, topic_name: e.target.value }) : null)}
                      className="w-full bg-slate-950 border border-slate-800/85 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 mb-2 uppercase tracking-wider">Display Order (Index)</label>
                    <input
                      type="number"
                      required
                      value={editingTopic.topic_order}
                      onChange={e => setEditingTopic(prev => prev ? ({ ...prev, topic_order: parseInt(e.target.value) || 0 }) : null)}
                      className="w-full max-w-[150px] bg-slate-950 border border-slate-800/85 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 bg-slate-950/60 border border-slate-800/85 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2 flex items-center gap-1.5">
                    <span>📐</span> Curriculum Context
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-900/40">
                      <span className="text-slate-500">Board Scope</span>
                      <span className="text-slate-300 font-bold uppercase">{activeSubject?.board}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900/40">
                      <span className="text-slate-500">Target Grade</span>
                      <span className="text-slate-300 font-bold">Grade {activeSubject?.grade}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900/40">
                      <span className="text-slate-500">Subject</span>
                      <span className="text-slate-300 font-bold">{activeSubject?.subject_name}</span>
                    </div>
                    <div className="py-1">
                      <span className="text-slate-500 block mb-1">Parent Chapter</span>
                      <span className="text-purple-300 font-extrabold text-[11px] leading-relaxed">
                        Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || ''}: {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_name || ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. STUDY GUIDE */}
            {topicEditorTab === 'study_guide' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fadeIn">
                <div className="md:col-span-8 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider">Lesson Material & Syllabus Guide</label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {editingTopic.content_text.length} chars | {editingTopic.content_text.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>

                  {/* Markdown Quick Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 bg-slate-950/80 border border-slate-850 p-1.5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => insertMarkdown('## ')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="Heading 2"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('### ')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="Heading 3"
                    >
                      H3
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('**text**')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="Bold"
                    >
                      <b>B</b>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('*text*')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="Italic"
                    >
                      <i>I</i>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('\n- ')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="List"
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('`code`')}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-900/60 rounded hover:bg-slate-800 transition-colors"
                      title="Code Inline"
                    >
                      &lt;/&gt;
                    </button>
                  </div>

                  <textarea
                    id="guide-textarea"
                    placeholder="Provide deep direct instruction text, study guide syllabus outlines, core vocabulary, or detailed syllabus content..."
                    rows={12}
                    value={editingTopic.content_text}
                    onChange={e => setEditingTopic(prev => prev ? ({ ...prev, content_text: e.target.value }) : null)}
                    className="w-full bg-slate-950 border border-slate-800/85 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono leading-relaxed resize-none"
                  />
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTopic(prev => {
                          if (!prev) return null
                          const template = `## 📖 Overview & Concept Introduction\nIntroduce the core concepts of this syllabus topic here. Keep it structured and clear for students.\n\n## 💡 Key Terms & Definitions\n- **Term 1**: High level details regarding Term 1.\n- **Term 2**: Details regarding Term 2.\n\n## 📝 Step-by-Step Solved Problems\nLet's apply our knowledge through structured exercises:\n1. **Question**: State the sample question here.\n   - *Step-by-Step Explanation*: Show the calculation or logic clearly.\n   - *Solution*: Highlight final outputs.`
                          return { ...prev, content_text: prev.content_text ? prev.content_text + '\n\n' + template : template }
                        })
                      }}
                      className="text-[10px] bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white px-3 py-1.5 rounded-lg text-slate-400 font-bold transition-all flex items-center gap-1"
                    >
                      ✨ Insert Standard Outline Template
                    </button>
                  </div>
                </div>

                <div className="md:col-span-4 bg-slate-950/60 border border-slate-800/85 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">✍️ Content Designer Tips</h4>
                  <ul className="space-y-3 text-[11px] text-slate-500 list-disc list-inside leading-relaxed">
                    <li><strong className="text-slate-400">Structure with Headers</strong>: Use markdown headers <code className="text-purple-400">## Title</code> to make it readable.</li>
                    <li><strong className="text-slate-400">Formatting</strong>: Use bolding and lists to highlight important formulas.</li>
                    <li><strong className="text-slate-400">Real World Application</strong>: Add a solved exercise sample to reinforce learning.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 3. TEXTBOOK REFERENCE */}
            {topicEditorTab === 'textbook' && (
              <div className="max-w-2xl space-y-4 animate-fadeIn">
                <div>
                  <label className="block text-xs font-extrabold text-slate-400 mb-2 uppercase tracking-wider">Official Textbook PDF Reference Link (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/textbooks/math-ch1-lemma.pdf"
                    value={editingTopic.content_pdf_url}
                    onChange={e => setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: e.target.value }) : null)}
                    className="w-full bg-slate-950 border border-slate-800/85 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Providing an official textbook PDF link allows teachers and pupils to toggle the formal textbook chapter scans directly side-by-side during revisions.
                  </p>
                </div>

                {/* PDF Drag-and-Drop / Upload Dropzone */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Or Upload Textbook PDF directly</label>
                  <div className="border border-dashed border-slate-800 hover:border-purple-500/50 bg-slate-950/40 hover:bg-slate-950/80 rounded-2xl p-6 text-center transition-all relative group cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const url = await handleUploadFile(file, 'textbooks')
                          if (url && editingTopic) {
                            setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: url }) : null)
                          }
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <div className="space-y-2">
                      <span className="text-2xl block group-hover:scale-110 transition-transform">📂</span>
                      {uploading ? (
                        <div className="space-y-1">
                          <p className="text-xs text-purple-400 font-bold">Uploading file... {uploadProgress}%</p>
                          <div className="w-48 bg-slate-900 h-1.5 rounded-full mx-auto overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-slate-300 font-extrabold">Drag & drop your Textbook PDF here, or <span className="text-purple-400">browse</span></p>
                          <p className="text-[10px] text-slate-600 font-medium mt-1">Supports PDF files up to 10MB</p>
                        </div>
                      )}
                      {uploadError && <p className="text-[10px] text-red-400 font-semibold">⚠️ {uploadError}</p>}
                    </div>
                  </div>
                </div>

                {editingTopic.content_pdf_url && (
                  <div className="bg-purple-950/20 border border-purple-500/25 p-4 rounded-xl flex items-center justify-between">
                    <div className="text-xs">
                      <span className="text-purple-300 font-bold block mb-0.5">Link Attachment Detected</span>
                      <span className="text-slate-400 truncate max-w-sm block font-mono text-[10px]">{editingTopic.content_pdf_url}</span>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={editingTopic.content_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-purple-900/60 hover:bg-purple-900 border border-purple-700 text-purple-300 text-xs px-3 py-1.5 rounded-lg transition-colors font-bold"
                      >
                        Test Link &rarr;
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditingTopic(prev => prev ? ({ ...prev, content_pdf_url: '' }) : null)}
                        className="bg-red-950/40 hover:bg-red-900 border border-red-800 text-red-300 text-xs px-3 py-1.5 rounded-lg transition-colors font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. MEDIA & ATTACHMENTS */}
            {topicEditorTab === 'media' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 animate-fadeIn">
                
                {/* Visual attachments checklist */}
                <div className="md:col-span-3 space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">
                    Current Attachments ({editingTopic.resources.length})
                  </h4>

                  {editingTopic.resources.length === 0 ? (
                    <div className="bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl py-12 text-center">
                      <span className="text-2xl block mb-2 opacity-50">📎</span>
                      <p className="text-xs text-slate-500 font-semibold">No media items attached yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editingTopic.resources.map((res, rIdx) => (
                        <div key={rIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {res.resource_type === 'video' ? '📺' : res.resource_type === 'gdoc' ? '📄' : res.resource_type === 'pdf' ? '📋' : '🔗'}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-200 block truncate">{res.title}</span>
                              <span className="text-[9px] text-slate-500 font-mono block truncate max-w-md">{res.url}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 hover:text-white px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg"
                            >
                              Open
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveResource(rIdx)}
                              className="text-[10px] text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-950/20 border border-red-800/30 rounded-lg"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resource addition form */}
                <div className="md:col-span-2 bg-slate-950/60 border border-slate-800/85 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-2">➕ Add Rich Attachment</h4>
                  
                  {/* Category Fast Switcher buttons */}
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { type: 'video', icon: '📺', label: 'Video' },
                      { type: 'gdoc', icon: '📄', label: 'Doc' },
                      { type: 'pdf', icon: '📋', label: 'PDF' },
                      { type: 'url', icon: '🔗', label: 'Link' }
                    ] as const).map(item => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setNewResourceForm(prev => ({ ...prev, resource_type: item.type }))}
                        className={`p-2 rounded-xl text-center border transition-all flex flex-col items-center justify-center ${
                          newResourceForm.resource_type === item.type
                            ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span className="text-base mb-1">{item.icon}</span>
                        <span className="text-[9px] font-bold uppercase">{item.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Dropzone to upload directly */}
                  <div className="border border-dashed border-slate-800 hover:border-purple-500/50 bg-slate-950/40 hover:bg-slate-950/80 rounded-xl p-5 text-center transition-all relative group cursor-pointer">
                    <input
                      type="file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const url = await handleUploadFile(file, 'attachments')
                          if (url) {
                            let resourceType: 'video' | 'gdoc' | 'pdf' | 'url' | 'image' = 'url'
                            if (file.type.startsWith('video/')) {
                              resourceType = 'video'
                            } else if (file.type === 'application/pdf') {
                              resourceType = 'pdf'
                            } else if (file.type.startsWith('image/')) {
                              resourceType = 'image'
                            } else if (file.name.includes('doc') || file.type.includes('word') || file.type.includes('document')) {
                              resourceType = 'gdoc'
                            }
                            setNewResourceForm({
                              resource_type: resourceType,
                              title: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
                              url: url
                            })
                          }
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <div className="space-y-1">
                      <span className="text-xl block group-hover:scale-110 transition-transform">📤</span>
                      {uploading ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-purple-400 font-bold">Uploading... {uploadProgress}%</p>
                          <div className="w-32 bg-slate-900 h-1.5 rounded-full mx-auto overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] text-slate-300 font-bold">Upload file directly, or <span className="text-purple-400">browse</span></p>
                          <p className="text-[9px] text-slate-600 font-semibold">Auto-fills Title, Type, and Resource URL</p>
                        </div>
                      )}
                      {uploadError && <p className="text-[9px] text-red-400 font-semibold">⚠️ {uploadError}</p>}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Attachment Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Concept Video, Class Exercise Link"
                        value={newResourceForm.title}
                        onChange={e => setNewResourceForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Attachment Resource URL</label>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={newResourceForm.url}
                        onChange={e => setNewResourceForm(prev => ({ ...prev, url: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddResource}
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-md shadow-purple-500/10"
                    >
                      Attach to Topic &rarr;
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. LIVE SIMULATED PREVIEW */}
            {topicEditorTab === 'preview' && (
              <div className="max-w-3xl mx-auto animate-fadeIn">
                <div className="text-center mb-4">
                  <span className="text-xs text-slate-500 font-bold bg-slate-900 border border-slate-800 px-3 py-1 rounded-full uppercase tracking-wider">
                    🖥️ Simulated Student Viewport
                  </span>
                </div>

                {/* Device container */}
                <div className="bg-slate-950 border-4 border-slate-800/80 rounded-[36px] overflow-hidden shadow-2xl shadow-purple-500/5 max-w-xl mx-auto relative">
                  {/* Status Bar */}
                  <div className="bg-slate-900/60 px-6 py-2.5 flex items-center justify-between text-[10px] font-bold text-slate-600 border-b border-slate-900 font-mono select-none">
                    <span>09:41 AM</span>
                    <div className="w-16 h-4 bg-slate-950 rounded-full border border-slate-900/30 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 bg-slate-800 rounded-full inline-block" />
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <span>LTE</span>
                      <span className="w-3 h-2 bg-slate-600 rounded-sm" />
                    </div>
                  </div>

                  {/* Dynamic internal viewer */}
                  <div className="p-6 h-[460px] overflow-y-auto space-y-4 bg-slate-950/80 font-sans select-none scrollbar-thin scrollbar-thumb-purple-800">
                    
                    {/* Navigation Path */}
                    <div className="text-[9px] font-extrabold text-purple-400 uppercase tracking-widest flex items-center gap-1">
                      <span>{activeSubject?.board || 'CBSE'}</span>
                      <span>/</span>
                      <span>Ch {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_order || activeChapterId}</span>
                      <span>/</span>
                      <span className="text-slate-500">Guide</span>
                    </div>

                    {/* Topic Title */}
                    <h3 className="text-lg font-black text-white leading-tight">
                      {editingTopic.topic_name.trim() ? editingTopic.topic_name : 'Untitled Lesson Topic'}
                    </h3>

                    {/* Direct Syllabus Guide Content (rendered markdown-like) */}
                    <div className="text-[11px] text-slate-300 leading-relaxed space-y-3 whitespace-pre-wrap font-sans bg-slate-900/30 border border-slate-900 p-4 rounded-2xl">
                      {editingTopic.content_text.trim() ? (
                        editingTopic.content_text
                      ) : (
                        <span className="text-slate-600 italic">No direct guide text added yet. Toggle to the &quot;Study Guide Content&quot; tab to write materials.</span>
                      )}
                    </div>

                    {/* Textbook link card */}
                    {editingTopic.content_pdf_url && (
                      <a
                        href={editingTopic.content_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-950/30 to-indigo-950/20 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl transition-all"
                      >
                        <span className="text-2xl">📖</span>
                        <div className="min-w-0">
                          <span className="text-xs font-black text-slate-100 block">Coursebook PDF reference</span>
                          <span className="text-[9px] text-slate-500 block font-mono truncate">Open textbook scanned pages</span>
                        </div>
                      </a>
                    )}

                    {/* Attachments Column */}
                    {editingTopic.resources.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">Attached Revision Materials</span>
                        <div className="grid grid-cols-1 gap-2">
                          {editingTopic.resources.map((res, rIdx) => (
                            <a
                              key={rIdx}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800/80 hover:border-slate-700/60 rounded-2xl transition-all"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-base">
                                  {res.resource_type === 'video' ? '📺' : res.resource_type === 'gdoc' ? '📄' : res.resource_type === 'pdf' ? '📋' : '🔗'}
                                </span>
                                <div>
                                  <span className="text-[11px] font-bold text-slate-200 block">{res.title}</span>
                                  <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">{res.resource_type} Resource</span>
                                </div>
                              </div>
                              <span className="text-[9px] text-purple-400 font-extrabold">&rarr;</span>
                            </a>
                          ))}
                        </div>
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
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Syllabus Template Scope</h3>
              
              <div className="space-y-4">
                {/* Board Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Academic Board</label>
                  <div className="space-y-1">
                    {BOARDS.map(b => (
                      <button
                        key={b.key}
                        onClick={() => setSelectedBoard(b.key)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
                          selectedBoard === b.key
                            ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-500/20'
                            : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{b.label}</span>
                        {selectedBoard === b.key && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grade Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Grade level</label>
                  <div className="grid grid-cols-5 gap-1 bg-slate-900/60 p-1 rounded-xl">
                    {GRADES.map(g => (
                      <button
                        key={g}
                        onClick={() => setSelectedGrade(g)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          selectedGrade === g
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Subjects List */}
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subjects ({subjects.length})</h3>
                <button
                  onClick={() => setShowSubjectModal(true)}
                  className="text-[10px] bg-purple-600 hover:bg-purple-500 font-bold px-2 py-1 rounded-lg text-white transition-colors"
                >
                  + Add Subject
                </button>
              </div>

              {loading ? (
                <div className="py-6 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : subjects.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No subjects created for this board & grade.</p>
              ) : (
                <div className="space-y-1">
                  {subjects.map(s => (
                    <div
                      key={s.id}
                      className={`group w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-all ${
                        activeSubject?.id === s.id
                          ? 'bg-purple-950/40 border border-purple-500/30 text-purple-300 font-semibold'
                          : 'bg-transparent border border-transparent text-slate-400 hover:bg-slate-900/50'
                      }`}
                    >
                      <button onClick={() => setActiveSubject(s)} className="flex-1 text-left truncate">
                        📚 {s.subject_name}
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(s.id, s.subject_name)}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all ml-1 p-0.5"
                        title="Delete Master Subject"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Master Catalog Hierarchy Panel */}
          <div className="lg:col-span-3 space-y-6">
            {error && (
              <div className="bg-red-950/40 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl flex justify-between items-center text-xs">
                <span>⚠️ {error}</span>
                <button onClick={() => setError('')} className="text-red-400 hover:text-red-200">✕</button>
              </div>
            )}

            {success && (
              <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl flex justify-between items-center text-xs">
                <span>✓ {success}</span>
                <button onClick={() => setSuccess('')} className="text-emerald-400 hover:text-emerald-200">✕</button>
              </div>
            )}

            {!activeSubject ? (
              <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-3xl py-24 text-center">
                <div className="w-16 h-16 bg-slate-900/60 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-800">
                  <span className="text-2xl">📐</span>
                </div>
                <h3 className="text-base font-bold text-white mb-1">Select or Create a Subject</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Define the curriculum template starting from academic board subjects, chapters, down to tasks.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Subject Card */}
                <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/20 border border-purple-500/20 rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] bg-purple-950 border border-purple-800/40 text-purple-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {activeSubject.board} Grade {activeSubject.grade}
                      </span>
                      <h2 className="text-xl font-extrabold text-white mt-2">{activeSubject.subject_name}</h2>
                      <p className="text-xs text-slate-400 mt-1">Master syllabus catalog template</p>
                    </div>
                    <button
                      onClick={() => setShowChapterModal(true)}
                      className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-500/20 self-start"
                    >
                      + Add New Chapter
                    </button>
                  </div>
                </div>

                {/* Chapters Accordion */}
                {loadingDetails ? (
                  <div className="py-24 text-center">
                    <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-400 text-xs font-semibold">Loading syllabus template...</p>
                  </div>
                ) : chapters.length === 0 ? (
                  <div className="bg-slate-950/20 border border-dashed border-slate-800 rounded-3xl py-16 text-center">
                    <p className="text-xs text-slate-500 mb-3">No chapters created in this master template yet.</p>
                    <button
                      onClick={() => setShowChapterModal(true)}
                      className="text-xs font-bold text-purple-400 hover:underline"
                    >
                      + Add first chapter now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chapters.map((ch, idx) => (
                      <div
                        key={ch.id}
                        className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 overflow-hidden transition-all hover:border-slate-700/60"
                      >
                        {/* Chapter header */}
                        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap pb-4 border-b border-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-purple-950 text-purple-300 border border-purple-800/50 rounded-xl flex items-center justify-center font-black text-xs">
                              {idx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Ch {ch.chapter_order}</span>
                                <h4 className="text-sm font-bold text-white">{ch.chapter_name}</h4>
                              </div>
                              {ch.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{ch.description}</p>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setActiveChapterId(ch.id)
                                setEditingTopic({
                                  chapter_id: ch.id,
                                  topic_name: '',
                                  topic_order: (ch.topics?.length || 0) + 1,
                                  content_text: '',
                                  content_pdf_url: '',
                                  resources: [],
                                  questions: []
                                })
                                setTopicEditorTab('general')
                              }}
                              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              + Add Topic
                            </button>
                            <button
                              onClick={() => {
                                setActiveChapterId(ch.id)
                                setShowTaskModal(true)
                              }}
                              className="bg-purple-950/40 border border-purple-800/50 hover:bg-purple-950 text-purple-300 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              + Add Master Task
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Topics Column */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                              <span>📝</span> Topics (Sub-chapters)
                            </h5>

                            {!ch.topics || ch.topics.length === 0 ? (
                              <p className="text-[11px] text-slate-600 italic py-2">No topics added.</p>
                            ) : (
                              <div className="space-y-2">
                                {ch.topics.map(t => (
                                  <div
                                    key={t.id}
                                    onClick={() => {
                                      setActiveChapterId(ch.id)
                                      setEditingTopic({
                                        id: t.id,
                                        chapter_id: ch.id,
                                        topic_name: t.topic_name,
                                        topic_order: t.topic_order,
                                        content_text: t.content_text || '',
                                        content_pdf_url: t.content_pdf_url || '',
                                        resources: t.resources || [],
                                        questions: t.questions || []
                                      })
                                      setTopicEditorTab('general')
                                    }}
                                    className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 hover:border-purple-500/50 cursor-pointer transition-all hover:bg-slate-900/90 group/topic"
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-bold text-slate-200 group-hover/topic:text-purple-300 transition-colors">
                                        {t.topic_order}. {t.topic_name}
                                      </p>
                                      <span className="text-[10px] text-purple-400 font-semibold opacity-0 group-hover/topic:opacity-100 transition-all">
                                        Edit &rarr;
                                      </span>
                                    </div>
                                    {t.content_text && (
                                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{t.content_text}</p>
                                    )}
                                    {t.content_pdf_url && (
                                      <p className="text-[10px] text-purple-400/80 truncate mt-1">📄 {t.content_pdf_url}</p>
                                    )}

                                    {/* Resources list */}
                                    {t.resources && t.resources.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {t.resources.map(r => (
                                          <span
                                            key={r.id}
                                            className="text-[9px] bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono truncate max-w-[150px]"
                                            title={`${r.title} (${r.resource_type})`}
                                          >
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

                          {/* Tasks Column */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                              <span>🎯</span> Exercises & Master Tasks
                            </h5>

                            {!ch.tasks || ch.tasks.length === 0 ? (
                              <p className="text-[11px] text-slate-600 italic py-2">No master tasks added.</p>
                            ) : (
                              <div className="space-y-2">
                                {ch.tasks.map(tsk => (
                                  <div key={tsk.id} className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 flex justify-between items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs font-bold text-slate-200 truncate">{tsk.title}</p>
                                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase ${
                                          tsk.is_mandatory
                                            ? 'bg-red-950 text-red-300 border border-red-800/40'
                                            : 'bg-orange-950 text-orange-300 border border-orange-800/40'
                                        }`}>
                                          {tsk.is_mandatory ? 'Mandatory 🔒' : 'Optional'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{tsk.instructions}</p>
                                      <div className="flex gap-2 mt-1.5 text-[9px] text-slate-500">
                                        <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 capitalize">{tsk.task_type}</span>
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

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowSubjectModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
            <h3 className="text-base font-bold text-white mb-4">Create Master Subject</h3>
            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Subject Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics, Science"
                  required
                  value={newSubjectForm.subject_name}
                  onChange={e => setNewSubjectForm({ subject_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Create Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Chapter Modal */}
      {showChapterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowChapterModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
            <h3 className="text-base font-bold text-white mb-4">Add Master Chapter</h3>
            <form onSubmit={handleCreateChapter} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Chapter Name</label>
                <input
                  type="text"
                  placeholder="e.g. Real Numbers"
                  required
                  value={newChapterForm.chapter_name}
                  onChange={e => setNewChapterForm(prev => ({ ...prev, chapter_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Description</label>
                <textarea
                  placeholder="Summary of chapters or learning outcomes"
                  rows={3}
                  value={newChapterForm.description}
                  onChange={e => setNewChapterForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChapterModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Create Chapter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowTaskModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
            <h3 className="text-base font-bold text-white mb-4">Add Master Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Chapter 1 Board worksheet"
                  required
                  value={newTaskForm.title}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Topic Mapping (Optional)</label>
                <select
                  value={newTaskForm.topic_id}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, topic_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">No topic mapping (Chapter level task)</option>
                  {chapters.find(c => c.id === activeChapterId)?.topics?.map(t => (
                    <option key={t.id} value={t.id}>{t.topic_order}. {t.topic_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Instructions / Details</label>
                <textarea
                  placeholder="Task instructions..."
                  rows={3}
                  value={newTaskForm.instructions}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, instructions: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Task Type</label>
                  <select
                    value={newTaskForm.task_type}
                    onChange={e => setNewTaskForm(prev => ({ ...prev, task_type: e.target.value as 'homework' | 'test' | 'worksheet' }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="homework">Homework</option>
                    <option value="test">Test</option>
                    <option value="worksheet">Worksheet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Max Marks</label>
                  <input
                    type="number"
                    required
                    value={newTaskForm.max_marks}
                    onChange={e => setNewTaskForm(prev => ({ ...prev, max_marks: parseInt(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_mandatory_chk"
                  checked={newTaskForm.is_mandatory}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, is_mandatory: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 bg-slate-950 border-slate-800 rounded focus:ring-purple-500"
                />
                <label htmlFor="is_mandatory_chk" className="text-xs font-bold text-slate-300 cursor-pointer select-none">
                  🔒 Mark as Government Mandated (Required for all schools)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
