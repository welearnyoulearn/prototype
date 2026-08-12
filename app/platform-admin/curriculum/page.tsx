'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  BookOpen, Plus, Pencil, X, Upload, ChevronRight, FileText, Sparkles,
  HelpCircle, CheckCircle2, Layers, ArrowLeft, Trash2, Check, FolderInput, Loader2,
} from 'lucide-react'
import { INK, TEAL, CREAM, GREEN, PURPLE, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { BulkImportPanel } from '@/app/components/ulearn/BulkImportPanel'
import { Toast } from '@/app/components/ulearn/primitives'
import { useToast } from '@/app/components/ulearn/useToast'
import { syllabusPrompt, SYLLABUS_EXAMPLE } from '@/lib/syllabus/chatgpt-prompt'
import { parseSyllabusBulk } from '@/lib/syllabus/bulk-import-schema'

type Subject = {
  id: number
  board: string
  grade: string
  subject_name: string
  created_at: string
  category?: 'academic' | 'extra'
}

type BookType = 'textbook' | 'handbook' | 'workbook'
type Audience = 'teacher' | 'student' | 'both'

type Chapter = {
  id: number
  subject_id: number
  chapter_name: string
  chapter_order: number
  description: string
  semester?: string | null
  book_type?: BookType | null
  audience?: Audience | null
  book_name?: string | null
  topics?: Topic[]
  tasks?: Task[]
}

const BOOK_TYPE_LABELS: Record<BookType, string> = {
  textbook: 'Text Book',
  handbook: 'Hand Book',
  workbook: 'Work Book',
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  teacher: 'Teacher Edition',
  student: 'Student Edition',
  both: 'Teacher & Student',
}

/** Convenience default only — mirrors lib/syllabus/bulk-import-schema.ts's defaultAudienceForBookType. */
function defaultAudienceForBookType(bt: BookType): Audience {
  return bt === 'handbook' ? 'teacher' : 'student'
}

/** Label to append to a book tab (e.g. "· Teacher Edition") based on the
 * majority audience among that book's own chapters — purely cosmetic, no
 * filtering. Omitted for plain 'student' (today's default, no need to call it out). */
function majorityAudienceBadge(groupChapters: Chapter[]): string | null {
  const counts: Record<Audience, number> = { teacher: 0, student: 0, both: 0 }
  for (const c of groupChapters) counts[c.audience || 'student'] += 1
  const majority = (Object.entries(counts) as [Audience, number][]).sort((a, b) => b[1] - a[1])[0]
  if (!majority || majority[1] === 0 || majority[0] === 'student') return null
  return AUDIENCE_LABELS[majority[0]]
}

// A "book" a chapter belongs to is really the (book_type, book_name) pair —
// book_type alone can't tell two different Text Books apart. Grouped so
// that when only one book exists for a given type, its tab keeps today's
// generic label (no unnecessary UI change); once a second book shares that
// type, each gets its own tab labeled with its actual name.
type BookGroup = { key: string; book_type: BookType; book_name: string | null; label: string; chapters: Chapter[] }

function bookGroupKey(bookType: string | null | undefined, bookName: string | null | undefined): string {
  return `${bookType || 'textbook'}::${bookName || ''}`
}

function computeBookGroups(chapters: Chapter[]): BookGroup[] {
  const byType = new Map<BookType, Map<string, Chapter[]>>()
  for (const c of chapters) {
    const bt = (c.book_type || 'textbook') as BookType
    const bn = c.book_name || ''
    if (!byType.has(bt)) byType.set(bt, new Map())
    const byName = byType.get(bt)!
    if (!byName.has(bn)) byName.set(bn, [])
    byName.get(bn)!.push(c)
  }
  const groups: BookGroup[] = []
  for (const bt of ['textbook', 'handbook', 'workbook'] as BookType[]) {
    const byName = byType.get(bt)
    if (!byName || byName.size === 0) continue
    const entries = Array.from(byName.entries())
    if (entries.length === 1) {
      const [bn, chs] = entries[0]
      groups.push({ key: bookGroupKey(bt, bn), book_type: bt, book_name: bn || null, label: BOOK_TYPE_LABELS[bt], chapters: chs })
    } else {
      let unnamedCount = 0
      for (const [bn, chs] of entries) {
        if (!bn) {
          unnamedCount += 1
          groups.push({ key: bookGroupKey(bt, bn), book_type: bt, book_name: null, label: `${BOOK_TYPE_LABELS[bt]} ${unnamedCount}`, chapters: chs })
        } else {
          groups.push({ key: bookGroupKey(bt, bn), book_type: bt, book_name: bn, label: bn, chapters: chs })
        }
      }
    }
  }
  return groups
}

// Topics are stored flat, but the source book's own numbering ("5.2",
// "5.2.1", "5.2.5.I", "3.2.3(i)") is baked into each title — this reads
// that back out to give the list a visual hierarchy without needing any
// schema change. A trailing roman-numeral or parenthesized sub-marker
// ("5.2.5.I", "5.2.5. IV", "3.2.3(i)", "3.1.2 (ii)") counts as one level
// deeper than its numeric parent, not the same depth. Returns null when a
// title has no recognizable numbering at all — the caller decides what to
// do with that (see the running-depth tracking below).
function topicNumberDepth(name: string): number | null {
  const m = name.match(/^(\d+(?:\.\d+)*)(\.?\s*(?:[ivxlcdm]+\b|\([ivxlcdm]+\)))?/i)
  if (!m) return null
  const segments = m[1].split('.').length
  return m[2] ? segments + 1 : segments
}

// A single-hue tonal scale rather than a different color per level — reads
// as one coherent hierarchy (main topic fading down to its children)
// instead of a row of unrelated accent colors. Index = nesting level,
// capped at the array length for anything deeper than that.
const TOPIC_DEPTH_STYLES: { border: string; text: string; weight: string; size: string }[] = [
  { border: PURPLE, text: INK, weight: 'font-bold', size: 'text-xs' },
  { border: `${PURPLE}99`, text: '#4B5563', weight: 'font-semibold', size: 'text-[11px]' },
  { border: `${PURPLE}4D`, text: '#6B7280', weight: 'font-medium', size: 'text-[10px]' },
  { border: BORDER, text: '#9CA3AF', weight: 'font-normal', size: 'text-[10px]' },
]

type Topic = {
  id: number
  chapter_id: number
  topic_name: string
  topic_order: number
  content_text: string
  content_pdf_url: string
  subtopics?: string[]
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

type Material = {
  id: number
  subject_id: number
  material_type: 'textbook' | 'handbook'
  title: string
  file_url: string
  created_at: string
}

// Client-side model of a picked local folder, shaped like the Library
// Builder script's output: <Class>/<Subject>/<BookType>/<BookName>.pdf,
// with an optional chapters JSON dropped anywhere inside a subject's tree.
type ImportBook = { bookType: string; file: File }

// One detected chapters JSON under a subject's folder tree. Every JSON file
// found is kept (not just the first) so nothing gets silently dropped when a
// subject has more than one book (e.g. separate Text Book / Hand Book files,
// or SEM-1/SEM-2 parts of the same book).
type ImportJsonFile = {
  id: string // the file's webkitRelativePath — stable/unique within one folder walk
  file: File
  bookType: string // detected folder name, pre-classification (same source PDFs use)
  displayName: string
  semesterLabel: string
  include: boolean
}

// Two or more same-book-type JSON files combined client-side into one
// semester-grouped import (see handleMergeFiles) — replaces those files'
// individual rows in the review UI until undone.
type MergedGroup = {
  id: string
  bookType: string
  bookName: string | null
  fileIds: string[]
  fileNames: string[]
  combinedJson: string
  chapterCount: number
}

type ImportSubjectGroup = {
  subjectName: string
  include: boolean
  jsonFiles: ImportJsonFile[]
  merges: MergedGroup[]
  books: ImportBook[]
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
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [newSubjectForm, setNewSubjectForm] = useState({ subject_name: '' })

  const [showChapterModal, setShowChapterModal] = useState(false)
  const [newChapterForm, setNewChapterForm] = useState<{ chapter_name: string; description: string; semester: string; book_type: BookType; audience: Audience; book_name: string }>({ chapter_name: '', description: '', semester: '', book_type: 'textbook', audience: 'student', book_name: '' })

  // Bulk JSON import (prototype feature) — writes chapters + topics + inline
  // quizzes to the master library via /api/platform/syllabus/bulk-import.
  const [showBulk, setShowBulk] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [importing, setImporting] = useState(false)
  // Fallback book type/name for pasted JSON that doesn't self-declare one
  // (the book-extraction `{ units, book_type, book }` shape does; a plain
  // chapter array doesn't, so this picks which book those chapters land under).
  const [bulkBookType, setBulkBookType] = useState<BookType>('textbook')
  const [bulkAudience, setBulkAudience] = useState<Audience>('student')
  const [bulkBookName, setBulkBookName] = useState('')

  // Which book's chapters are currently shown — keyed by (book_type,
  // book_name), not book_type alone, so two different books sharing a type
  // (e.g. two Text Books) get their own tab. Only rendered as a switcher
  // when a subject actually has more than one book.
  const [activeBookKey, setActiveBookKey] = useState<string | null>(null)

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

  // Subject-level textbook/handbook materials (uploaded once per subject, not
  // per-chapter — see master_subject_materials).
  const [materials, setMaterials] = useState<Material[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [showFilesViewModal, setShowFilesViewModal] = useState(false)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [materialTypeToUpload, setMaterialTypeToUpload] = useState<'textbook' | 'handbook' | null>(null)
  const [newMaterialFiles, setNewMaterialFiles] = useState<File[]>([])
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [materialUploadLog, setMaterialUploadLog] = useState<string[]>([])

  // Import an entire local folder (Library Builder output): one JSON per
  // subject for chapters/topics/subtopics, plus PDFs under BookType folders
  // uploaded as materials. Picked via a hidden <input webkitdirectory>.
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRootName, setImportRootName] = useState('')
  const [importGroups, setImportGroups] = useState<ImportSubjectGroup[]>([])
  const [bookTypeChoices, setBookTypeChoices] = useState<Record<string, BookType>>({})
  const [importRunning, setImportRunning] = useState(false)
  const [importLog, setImportLog] = useState<string[]>([])
  // Keyed by subject+bookType so the error renders next to the specific
  // Merge button that triggered it — a single global banner at the top of a
  // long, scrollable modal is easy to miss entirely once you've scrolled
  // down to the group you're actually merging.
  const [mergeError, setMergeError] = useState<{ subjectName: string; bookType: string; message: string } | null>(null)
  const [expandedMergeId, setExpandedMergeId] = useState<string | null>(null)

  const { toast, flash, copyPrompt } = useToast()

  // Load master subjects
  const loadSubjects = useCallback(async () => {
    setLoading(true)
    setError('')
    // Clear any bulk-select checkboxes whenever the visible subject list
    // changes — otherwise a selection made under one board/grade could
    // silently carry over and get deleted after switching filters.
    setSelectedSubjectIds(new Set())
    try {
      const board = category === 'extra' ? EXTRA_BOARD : selectedBoard
      const res = await fetch(`/api/platform/subjects?board=${board}&grade=${selectedGrade}&category=${category}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = data.subjects || []
      setSubjects(list)
      if (list.length > 0) {
        // Functional update so this callback doesn't need activeSubject in its
        // own dependency array — otherwise every subject click (which changes
        // activeSubject) would recreate loadSubjects and re-trigger its effect,
        // needlessly refetching the whole subjects list on every click.
        setActiveSubject(prev => list.find((s: Subject) => s.id === prev?.id) || list[0])
      } else {
        setActiveSubject(null)
        setChapters([])
      }
    } catch {
      setError('Failed to fetch subjects.')
    } finally {
      setLoading(false)
    }
  }, [category, selectedBoard, selectedGrade])

  useEffect(() => {
    loadSubjects()
  }, [loadSubjects])

  // Load subject chapters, topics, and tasks — one batched request instead of
  // 1 + 2*chapters sequential fetches (see /api/platform/subjects/[id]/full).
  const loadSubjectDetails = useCallback(async () => {
    if (!activeSubject) return
    setLoadingDetails(true)
    setError('')
    try {
      const res = await fetch(`/api/platform/subjects/${activeSubject.id}/full`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setChapters((data as Chapter[]).sort((a, b) => a.chapter_order - b.chapter_order))
    } catch {
      setError('Failed to load syllabus details.')
    } finally {
      setLoadingDetails(false)
    }
  }, [activeSubject])

  useEffect(() => {
    loadSubjectDetails()
  }, [loadSubjectDetails])

  const loadMaterials = useCallback(async () => {
    if (!activeSubject) return
    setLoadingMaterials(true)
    try {
      const res = await fetch(`/api/platform/subjects/${activeSubject.id}/materials`)
      const data = await res.json()
      if (res.ok) setMaterials(data)
    } catch {
      // non-fatal — materials panel just stays empty
    } finally {
      setLoadingMaterials(false)
    }
  }, [activeSubject])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

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
          semester: newChapterForm.semester.trim() || null,
          book_type: newChapterForm.book_type,
          audience: newChapterForm.audience,
          book_name: newChapterForm.book_name.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Chapter created successfully!')
      setShowChapterModal(false)
      setNewChapterForm({ chapter_name: '', description: '', semester: '', book_type: 'textbook', audience: 'student', book_name: '' })
      loadSubjectDetails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chapter.')
    }
  }

  // Bulk import: POST the pasted JSON to the transactional route, then refresh.
  const handleBulkImport = async (json: string, mode: 'append' | 'replace') => {
    if (!activeSubject) return
    const bookLabel = bulkBookName.trim() || BOOK_TYPE_LABELS[bulkBookType]
    if (mode === 'replace' && !confirm(
      `Replace all chapters for "${activeSubject.subject_name}"?\n\nThis permanently deletes every existing chapter (and its topics) for whichever exact book this JSON covers — typically "${bookLabel}" — before writing the new ones. Other books on this subject (including other ${BOOK_TYPE_LABELS[bulkBookType]}s) are untouched. This cannot be undone.`
    )) return
    setBulkError('')
    setImporting(true)
    try {
      const res = await fetch('/api/platform/syllabus/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: activeSubject.id, mode, json, book_type: bulkBookType, audience: bulkAudience, book_name: bulkBookName.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setShowBulk(false)
      const parts = [
        data.chapters_created ? `${data.chapters_created} new` : null,
        data.chapters_updated ? `${data.chapters_updated} updated (re-imported)` : null,
      ].filter(Boolean).join(', ')
      const repairNote = data.sections_merged
        ? ` ${data.sections_merged} misplaced section${data.sections_merged === 1 ? '' : 's'} auto-merged into ${data.sections_merged === 1 ? 'its' : 'their'} chapter.`
        : ''
      flash(`Imported ${data.chapters} chapter${data.chapters === 1 ? '' : 's'}${parts ? ` — ${parts}` : ''} (${mode}).${repairNote}`)
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

  // File Upload to Cloudinary using XMLHttpRequest for tracking upload progress.
  // Returns null on failure (existing contract, several call sites just no-op
  // on null) — but also stashes the real reason in uploadError state and,
  // optionally, hands it straight to onError so callers that need it
  // immediately (not from a possibly-stale state closure) can surface it.
  const handleUploadFile = async (file: File, folder: string = 'curriculum-resources', onError?: (msg: string) => void) => {
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
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText))
            return
          }
          // Cloudinary's error body is { error: { message } } — surface that
          // instead of a generic "request failed" so a bad preset / oversized
          // file / invalid signature is actually diagnosable from the log.
          let detail = `Cloudinary upload failed (HTTP ${xhr.status})`
          try {
            const body = JSON.parse(xhr.responseText)
            if (body?.error?.message) detail = body.error.message
          } catch { /* non-JSON error body — keep the generic detail */ }
          reject(new Error(detail))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(formData)
      })
      return uploadResult.secure_url as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      onError?.(msg)
      return null
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // Subject materials (textbooks/handbooks) go to Cloudflare R2 instead of
  // Cloudinary — these scanned PDFs routinely blow past Cloudinary's
  // free-tier 10MB-per-file cap (some run 50-80MB), and R2 has no such limit.
  // Same presign-then-PUT-directly shape as handleUploadFile above, just
  // against our own /api/platform/materials/upload-sign instead of Cloudinary.
  const handleUploadFileToR2 = async (file: File, onError?: (msg: string) => void) => {
    if (!file) return null
    setUploading(true)
    setUploadProgress(0)
    setUploadError('')
    try {
      const signRes = await fetch('/api/platform/materials/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_type: file.type || 'application/pdf' }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData?.error || 'Failed to get upload URL')
      const { uploadUrl, key } = signData

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/pdf')
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed (HTTP ${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })
      return `/api/materials/file?key=${encodeURIComponent(key)}` as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      onError?.(msg)
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

  // Uploads every picked file as its own material, one at a time, logging
  // each result — same "keep going, show what happened" pattern as the
  // folder import, so a bad file doesn't stop the rest of the batch.
  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSubject || !materialTypeToUpload || newMaterialFiles.length === 0) return
    setSavingMaterial(true)
    setMaterialUploadLog([])
    const log = (line: string) => setMaterialUploadLog(prev => [...prev, line])

    let succeeded = 0
    let failed = 0
    for (const file of newMaterialFiles) {
      const title = file.name.replace(/\.[^./]+$/, '')
      try {
        let uploadErrMsg = ''
        const url = await handleUploadFileToR2(file, msg => { uploadErrMsg = msg })
        if (!url) throw new Error(uploadErrMsg || 'File upload failed')

        const res = await fetch(`/api/platform/subjects/${activeSubject.id}/materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material_type: materialTypeToUpload, title, file_url: url }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        log(`✓ ${title}`)
        succeeded += 1
      } catch (err) {
        log(`✗ ${title}: ${err instanceof Error ? err.message : 'upload failed'}`)
        failed += 1
      }
    }

    log('Done.')
    flash(`Uploaded ${succeeded} file${succeeded === 1 ? '' : 's'}${failed ? `, ${failed} failed — see log below` : ''}.`)
    setSavingMaterial(false)
    setNewMaterialFiles([])
    loadMaterials()
  }

  const handleDeleteMaterial = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/platform/materials/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete material')
      setSuccess(`"${title}" deleted.`)
      loadMaterials()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete material.')
    }
  }

  // Reads the picked folder (webkitdirectory gives every file's relative
  // path) and groups it as <Subject>/<BookType>/<Book>.pdf, with a chapters
  // JSON expected alongside the PDFs in the same BookType folder.
  //
  // Depth-agnostic on purpose: the admin might pick the whole save location
  // (.../<Class>/<Subject>/<BookType>/file), a single Class folder
  // (<Subject>/<BookType>/file), or even a single Subject folder
  // (<BookType>/file) — in every case BookType is the file's immediate
  // parent folder and Subject is the folder above that, so we always read
  // them as the last two folders before the file rather than assuming a
  // fixed depth from the picked root.
  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    const groups = new Map<string, ImportSubjectGroup>()
    const bookTypes = new Set<string>()
    let rootName = ''

    for (const file of files) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const parts = rel.split('/')
      if (!rootName) rootName = parts[0] || ''

      const isJson = /\.json$/i.test(file.name)
      const isPdf = /\.pdf$/i.test(file.name)
      if (!isJson && !isPdf) continue

      const bookType = parts[Math.max(0, parts.length - 2)] || rootName
      const subjectName = parts[Math.max(0, parts.length - 3)] || rootName

      if (!groups.has(subjectName)) groups.set(subjectName, { subjectName, include: true, jsonFiles: [], merges: [], books: [] })
      const group = groups.get(subjectName)!

      if (isJson) {
        // Every JSON file found is kept (not just the first) — a subject can
        // have several books (Text Book / Hand Book / Work Book, or several
        // semester parts of one book), and none should be silently dropped.
        bookTypes.add(bookType)
        group.jsonFiles.push({
          id: rel,
          file,
          bookType,
          displayName: file.name.replace(/\.json$/i, ''),
          semesterLabel: '',
          include: true,
        })
      } else {
        bookTypes.add(bookType)
        group.books.push({ bookType, file })
      }
    }

    const initialChoices: Record<string, BookType> = {}
    for (const bt of bookTypes) initialChoices[bt] = /hand.?book/i.test(bt) ? 'handbook' : /work.?book/i.test(bt) ? 'workbook' : 'textbook'

    setImportRootName(rootName)
    setImportGroups(Array.from(groups.values()).sort((a, b) => a.subjectName.localeCompare(b.subjectName)))
    setBookTypeChoices(initialChoices)
    setImportLog([])
    setShowImportModal(true)
  }

  // Combines every included, not-yet-merged JSON file of one book type under
  // a subject into a single semester-grouped import — parsed client-side with
  // the same parseSyllabusBulk the server uses, so a bad file's exact error
  // surfaces here instead of at import time. Each file's chapters are tagged
  // with the semester label the admin typed in for it.
  const handleMergeFiles = async (subjectName: string, bookType: string) => {
    setMergeError(null)
    const group = importGroups.find(g => g.subjectName === subjectName)
    if (!group) return
    const alreadyMergedIds = new Set(group.merges.flatMap(m => m.fileIds))
    const candidates = group.jsonFiles.filter(f => f.bookType === bookType && f.include && !alreadyMergedIds.has(f.id))
    if (candidates.length < 2) return
    if (candidates.some(f => !f.semesterLabel.trim())) {
      setMergeError({ subjectName, bookType, message: `Give every "${bookType}" file a semester label before merging.` })
      return
    }

    const parts: { semester: string; chapters: { title: string; topics: { title: string; subtopics: string[] }[] }[] }[] = []
    let bookName: string | null = null
    for (const f of candidates) {
      const text = await f.file.text()
      const parsed = parseSyllabusBulk(text)
      if (!parsed.ok) {
        setMergeError({ subjectName, bookType, message: `${f.displayName}: ${parsed.error}` })
        return
      }
      // Files being merged are expected to be the same book's semester
      // parts — take whichever one first declares a book name (its own
      // top-level "book" field) as the merged group's name.
      if (bookName === null) {
        const named = parsed.value.chapters.find(ch => ch.book_name)
        if (named) bookName = named.book_name
      }
      parts.push({
        semester: f.semesterLabel.trim(),
        chapters: parsed.value.chapters.map(ch => ({
          title: ch.title,
          topics: ch.topics.map(t => ({ title: t.title, subtopics: t.subtopics })),
        })),
      })
    }

    const combinedJson = JSON.stringify(parts, null, 2)
    const merge: MergedGroup = {
      id: `merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookType,
      bookName,
      fileIds: candidates.map(f => f.id),
      fileNames: candidates.map(f => f.displayName),
      combinedJson,
      chapterCount: parts.reduce((n, p) => n + p.chapters.length, 0),
    }
    setImportGroups(prev => prev.map(g => g.subjectName === subjectName ? { ...g, merges: [...g.merges, merge] } : g))
  }

  const handleUndoMerge = (subjectName: string, mergeId: string) => {
    setImportGroups(prev => prev.map(g => g.subjectName === subjectName ? { ...g, merges: g.merges.filter(m => m.id !== mergeId) } : g))
    if (expandedMergeId === mergeId) setExpandedMergeId(null)
  }

  // Runs the actual import: resolve/create each subject, bulk-import its
  // JSON if present, then upload+register every PDF as a material tagged by
  // its book-type folder. Continues past per-subject/per-file failures so one
  // bad row doesn't stall the whole batch — mirrors the Library Builder
  // script's "keep going, log failures" behaviour.
  const handleRunImport = async () => {
    setImportRunning(true)
    setImportLog([])
    const log = (line: string) => setImportLog(prev => [...prev, line])
    const board = category === 'extra' ? EXTRA_BOARD : selectedBoard
    let chaptersOk = 0
    let chaptersFailed = 0
    let filesOk = 0
    let filesFailed = 0

    for (const group of importGroups) {
      if (!group.include) continue
      log(`— ${group.subjectName}`)

      let subjectId = subjects.find(
        s => s.subject_name.trim().toLowerCase() === group.subjectName.trim().toLowerCase()
      )?.id

      if (!subjectId) {
        try {
          const res = await fetch('/api/platform/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board, grade: selectedGrade, subject_name: group.subjectName.trim(), category }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          subjectId = data.subject?.id
          log(`  created subject`)
        } catch (err) {
          log(`  ✗ failed to create subject: ${err instanceof Error ? err.message : 'unknown error'}`)
          continue
        }
      }
      if (!subjectId) {
        log(`  ✗ could not resolve a subject id — skipping`)
        continue
      }

      // Merged groups first (each is one combined semester-grouped import),
      // then every remaining checked JSON file that wasn't part of a merge —
      // every file the admin left checked gets imported, none silently
      // skipped like the old "first JSON wins" behaviour did.
      for (const merge of group.merges) {
        try {
          const jsonBookType = bookTypeChoices[merge.bookType]
          const res = await fetch('/api/platform/syllabus/bulk-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: subjectId, mode: 'append', json: merge.combinedJson, book_type: jsonBookType, book_name: merge.bookName }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          log(`  ✓ merged (${merge.fileNames.join(' + ')}): ${data.chapters} chapters, ${data.topics} topics`)
          chaptersOk += 1
        } catch (err) {
          log(`  ✗ merged import (${merge.fileNames.join(' + ')}) failed: ${err instanceof Error ? err.message : 'unknown error'}`)
          chaptersFailed += 1
        }
      }

      const mergedFileIds = new Set(group.merges.flatMap(m => m.fileIds))
      for (const jf of group.jsonFiles) {
        if (!jf.include || mergedFileIds.has(jf.id)) continue
        try {
          const rawText = await jf.file.text()
          // A semester label typed in without merging (nothing else to merge
          // it with) still needs to apply — wrap the file's own chapters in
          // a single semester group rather than silently ignoring the label.
          // That wrapper shape can't carry book_name itself, so it's pulled
          // out first and sent as an explicit override instead — otherwise
          // a named book would lose its identity the moment it gets a
          // semester label.
          let jsonToSend = rawText
          let jsonBookName: string | null = null
          if (jf.semesterLabel.trim()) {
            const parsed = parseSyllabusBulk(rawText)
            if (!parsed.ok) throw new Error(parsed.error)
            jsonBookName = parsed.value.chapters.find(ch => ch.book_name)?.book_name ?? null
            jsonToSend = JSON.stringify([{
              semester: jf.semesterLabel.trim(),
              chapters: parsed.value.chapters.map(ch => ({
                title: ch.title,
                topics: ch.topics.map(t => ({ title: t.title, subtopics: t.subtopics })),
              })),
            }])
          }
          const jsonBookType = bookTypeChoices[jf.bookType]
          const res = await fetch('/api/platform/syllabus/bulk-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: subjectId, mode: 'append', json: jsonToSend, book_type: jsonBookType, book_name: jsonBookName }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          log(`  ✓ ${jf.file.name}: ${data.chapters} chapters, ${data.topics} topics`)
          chaptersOk += 1
        } catch (err) {
          log(`  ✗ ${jf.file.name} import failed: ${err instanceof Error ? err.message : 'unknown error'}`)
          chaptersFailed += 1
        }
      }

      for (const book of group.books) {
        try {
          let uploadErrMsg = ''
          const url = await handleUploadFileToR2(book.file, msg => { uploadErrMsg = msg })
          if (!url) throw new Error(uploadErrMsg || 'upload failed')
          const title = book.file.name.replace(/\.pdf$/i, '')
          // master_subject_materials only accepts textbook/handbook (the
          // downloadable-file registry, separate from chapter book_type) —
          // a workbook classification still registers the PDF, just filed as
          // a handbook until that table's CHECK is widened.
          const classification = bookTypeChoices[book.bookType] || 'textbook'
          const material_type = classification === 'workbook' ? 'handbook' : classification
          const res = await fetch(`/api/platform/subjects/${subjectId}/materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ material_type, title, file_url: url }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          log(`  ✓ ${material_type}: ${title}`)
          filesOk += 1
        } catch (err) {
          log(`  ✗ ${book.file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
          filesFailed += 1
        }
      }
    }

    log('Done.')
    const chapterPart = chaptersOk || chaptersFailed ? `${chaptersOk} chapter import${chaptersOk === 1 ? '' : 's'} ok${chaptersFailed ? `, ${chaptersFailed} failed` : ''}` : null
    const filePart = filesOk || filesFailed ? `${filesOk} file${filesOk === 1 ? '' : 's'} uploaded${filesFailed ? `, ${filesFailed} failed` : ''}` : null
    flash([chapterPart, filePart].filter(Boolean).join(' · ') || 'Nothing to import.')
    setImportRunning(false)
    loadSubjects()
    if (activeSubject) { loadSubjectDetails(); loadMaterials() }
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

  const toggleSubjectSelection = (id: number) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleBulkDeleteSubjects = async () => {
    const ids = Array.from(selectedSubjectIds)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} selected subject${ids.length === 1 ? '' : 's'}?\nThis will cascade and delete all their Chapters, Topics, and Tasks.`)) return
    setError('')
    setSuccess('')
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/platform/subjects/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete subjects')
      setSuccess(`Deleted ${data.deleted} subject${data.deleted === 1 ? '' : 's'}.`)
      setSelectedSubjectIds(new Set())
      if (activeSubject && ids.includes(activeSubject.id)) setActiveSubject(null)
      loadSubjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subjects')
    } finally {
      setBulkDeleting(false)
    }
  }

  // Which books this subject actually has chapters for — only shown as a
  // switcher when there's more than one, so subjects that were never split
  // by book (the common case today) render exactly like they did before.
  const bookGroups = computeBookGroups(chapters)
  const effectiveBookKey = (activeBookKey && bookGroups.some(g => g.key === activeBookKey) ? activeBookKey : bookGroups[0]?.key) ?? null
  const effectiveBookGroup = bookGroups.find(g => g.key === effectiveBookKey) ?? null
  const chaptersForBook = bookGroups.length > 1 && effectiveBookGroup ? effectiveBookGroup.chapters : chapters

  // Chapter number as shown to the admin: position within its own book
  // (continuous across semesters, restarts at 1 for each book), never the
  // raw stored chapter_order — that's one counter shared across every book
  // on the subject.
  const chapterDisplayNumber = (chapterId: number | null): number | null => {
    const target = chapters.find(c => c.id === chapterId)
    if (!target) return null
    const targetKey = bookGroupKey(target.book_type, target.book_name)
    const siblings = chapters.filter(c => bookGroupKey(c.book_type, c.book_name) === targetKey)
    const idx = siblings.findIndex(c => c.id === chapterId)
    return idx === -1 ? null : idx + 1
  }

  // Group chapters by semester when the subject uses them — chapters without
  // a semester fall into one null bucket, which renders as a flat list (no
  // header) when it's the only bucket, so subjects that don't split by
  // semester look exactly like they did before.
  const hasSemesters = chaptersForBook.some(c => c.semester)
  const semesterGroups: { semester: string | null; chapters: Chapter[] }[] = hasSemesters
    ? Object.values(
        chaptersForBook.reduce((acc, ch) => {
          const key = ch.semester || ' none'
          if (!acc[key]) acc[key] = { semester: ch.semester || null, chapters: [] }
          acc[key].chapters.push(ch)
          return acc
        }, {} as Record<string, { semester: string | null; chapters: Chapter[] }>)
      )
    : [{ semester: null, chapters: chaptersForBook }]

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
                <span>Ch {chapterDisplayNumber(editingTopic.chapter_id) ?? activeChapterId}</span><span>/</span>
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
                        Ch {chapterDisplayNumber(editingTopic.chapter_id) ?? ''}: {chapters.find(c => c.id === editingTopic.chapter_id)?.chapter_name || ''}
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
                      <span>Ch {chapterDisplayNumber(editingTopic.chapter_id) ?? activeChapterId}</span>
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Subjects ({subjects.length})</h3>
                <button onClick={() => setShowSubjectModal(true)} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-white" style={{ background: PURPLE }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold px-2 py-2 rounded-lg border hover:bg-gray-50 mb-4"
                style={{ borderColor: BORDER, color: INK }}
              >
                <FolderInput size={13} /> Import folder…
              </button>
              <input
                ref={folderInputRef}
                type="file"
                multiple
                onChange={handleFolderSelected}
                className="hidden"
                {...({ webkitdirectory: 'true', directory: 'true' } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
              />
              {subjects.length > 0 && (
                <label className="flex items-center gap-2 mb-2 px-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={subjects.every(s => selectedSubjectIds.has(s.id))}
                    onChange={e => setSelectedSubjectIds(e.target.checked ? new Set(subjects.map(s => s.id)) : new Set())}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-[11px] font-medium text-gray-500">Select all</span>
                </label>
              )}
              {selectedSubjectIds.size > 0 && (
                <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 rounded-lg" style={{ background: '#FCEBEB' }}>
                  <span className="text-[11px] font-semibold" style={{ color: '#791F1F' }}>{selectedSubjectIds.size} selected</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedSubjectIds(new Set())} className="text-[11px] font-medium text-gray-500 hover:text-gray-700">Clear</button>
                    <button
                      onClick={handleBulkDeleteSubjects}
                      disabled={bulkDeleting}
                      className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-white disabled:opacity-50"
                      style={{ background: '#791F1F' }}
                    >
                      <Trash2 size={11} /> {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                    </button>
                  </div>
                </div>
              )}
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
                    const checked = selectedSubjectIds.has(s.id)
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
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSubjectSelection(s.id)}
                            className="w-3.5 h-3.5 rounded shrink-0"
                          />
                          <button onClick={() => setActiveSubject(s)} className="flex-1 text-left truncate font-medium flex items-center gap-1.5 min-w-0">
                            <BookOpen size={13} className="shrink-0" /> <span className="truncate">{s.subject_name}</span>
                          </button>
                        </div>
                        <button onClick={() => handleDeleteSubject(s.id, s.subject_name)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all ml-1 p-0.5 shrink-0" title="Delete subject">
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
                        onClick={() => {
                          setShowBulk(v => !v)
                          setBulkError('')
                          const bt = effectiveBookGroup?.book_type ?? 'textbook'
                          setBulkBookType(bt)
                          setBulkAudience(defaultAudienceForBookType(bt))
                          setBulkBookName(effectiveBookGroup?.book_name ?? '')
                        }}
                        className="flex items-center gap-1 text-sm font-medium px-3 py-2.5 rounded-xl border hover:bg-gray-50"
                        style={{ borderColor: showBulk ? PURPLE : BORDER, color: showBulk ? PURPLE : INK }}
                      >
                        <Upload size={15} /> Bulk upload JSON
                      </button>
                      <button
                        onClick={() => setShowFilesViewModal(true)}
                        className="flex items-center gap-1 text-sm font-medium px-3 py-2.5 rounded-xl border hover:bg-gray-50"
                        style={{ borderColor: BORDER, color: INK }}
                      >
                        <FileText size={15} /> View files{materials.length > 0 ? ` (${materials.length})` : ''}
                      </button>
                      <button
                        onClick={() => { setMaterialTypeToUpload(null); setNewMaterialFiles([]); setMaterialUploadLog([]); setShowMaterialModal(true) }}
                        className="flex items-center gap-1 text-sm font-medium px-3 py-2.5 rounded-xl border hover:bg-gray-50"
                        style={{ borderColor: BORDER, color: INK }}
                      >
                        <Upload size={15} /> Upload textbook / handbook
                      </button>
                      <button
                        onClick={() => {
                          const bt = effectiveBookGroup?.book_type ?? 'textbook'
                          setNewChapterForm(prev => ({ ...prev, book_type: bt, audience: defaultAudienceForBookType(bt), book_name: effectiveBookGroup?.book_name ?? '' }))
                          setShowChapterModal(true)
                        }}
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
                  <div className="bg-white rounded-2xl border p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: BORDER }}>
                    <label className="text-xs font-semibold text-gray-500 shrink-0">Import as</label>
                    <select
                      value={bulkBookType}
                      onChange={e => setBulkBookType(e.target.value as BookType)}
                      className={`${inputCls} max-w-[220px]`}
                      style={{ borderColor: BORDER }}
                    >
                      {(['textbook', 'handbook', 'workbook'] as const).map(bt => (
                        <option key={bt} value={bt}>{BOOK_TYPE_LABELS[bt]}</option>
                      ))}
                    </select>
                    <label className="text-xs font-semibold text-gray-500 shrink-0">For</label>
                    <select
                      value={bulkAudience}
                      onChange={e => setBulkAudience(e.target.value as Audience)}
                      className={`${inputCls} max-w-[200px]`}
                      style={{ borderColor: BORDER }}
                    >
                      {(['student', 'teacher', 'both'] as const).map(a => (
                        <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                      ))}
                    </select>
                    <label className="text-xs font-semibold text-gray-500 shrink-0">Book name</label>
                    <input
                      type="text"
                      placeholder="e.g. Telugu Parimalam (optional)"
                      value={bulkBookName}
                      onChange={e => setBulkBookName(e.target.value)}
                      className={`${inputCls} max-w-[220px]`}
                      style={{ borderColor: BORDER }}
                    />
                    <span className="text-[11px] text-gray-400">
                      Used unless the pasted JSON already declares its own <code>book_type</code>/<code>audience</code>/<code>book</code> (the book-extraction shape). Only needed when this subject has more than one book of the same type — keeps them from being treated as one.
                    </span>
                  </div>
                )}
                {showBulk && (
                  <BulkImportPanel
                    title={`Bulk import chapters — ${activeSubject.board} · Grade ${activeSubject.grade} · ${activeSubject.subject_name}`}
                    hint='Array of chapters — { "title", "topics" } — or, if the subject splits by semester, an array of semester groups — { "semester": "Sem 1", "chapters": [...] }. A topic is a string, or { "title": "...", "subtopics": [...] } to nest sub-topics under it. No quiz content — titles only.'
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

                {/* Book switcher — only when this subject has more than one book */}
                {bookGroups.length > 1 && (
                  <div className="bg-white p-1 rounded-2xl border flex flex-wrap gap-1" style={{ borderColor: BORDER }}>
                    {bookGroups.map(g => {
                      const active = g.key === effectiveBookKey
                      const badge = majorityAudienceBadge(g.chapters)
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setActiveBookKey(g.key)}
                          className="flex-1 text-center py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{ background: active ? PURPLE : 'transparent', color: active ? 'white' : '#6b7280' }}
                        >
                          {g.label}{badge ? ` · ${badge}` : ''}
                        </button>
                      )
                    })}
                  </div>
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
                  <div className="space-y-6">
                    {semesterGroups.map(group => (
                      <div key={group.semester ?? '__none__'} className="space-y-4">
                        {group.semester && (
                          <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: PURPLE }}>{group.semester}</h3>
                        )}
                        {group.chapters.map(ch => {
                          // Numbered by position within the active book
                          // (continuous across its semesters), not the raw
                          // stored chapter_order — that's one shared counter
                          // across every book on this subject, so a second
                          // same-type book's first chapter would otherwise
                          // inherit whatever number came after the first
                          // book's chapters instead of starting fresh at 1.
                          const idx = chaptersForBook.findIndex(c => c.id === ch.id)
                          return (
                    <div key={ch.id} className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
                        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap pb-4 border-b" style={{ borderColor: '#EFEDE6' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs" style={{ background: '#EEEDFE', color: PURPLE }}>{idx + 1}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PURPLE }}>Ch {idx + 1}</span>
                                <h4 className="text-sm font-semibold" style={{ color: INK }}>{ch.chapter_name}</h4>
                              </div>
                              {ch.description && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{ch.description}</p>}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Topics */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Topics</h5>
                            {!ch.topics || ch.topics.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic py-2">No topics added.</p>
                            ) : (() => {
                              // Normalize so the shallowest numbering found in
                              // this chapter counts as "main" (depth 0) — a
                              // book that numbers its first topic "5.1" and
                              // one that starts at "1.1" both read as main,
                              // not accidentally nested one level in.
                              const rawDepths = ch.topics.map(t => topicNumberDepth(t.topic_name)).filter((d): d is number => d !== null)
                              const baseDepth = rawDepths.length ? Math.min(...rawDepths) : 0
                              // Titles with no numbering of their own (an
                              // "Activity" box, an unlabeled elaboration
                              // paragraph, ...) aren't main topics just
                              // because they lack a number — they inherit
                              // one level deeper than whatever topic came
                              // right before them, tracked as we go. But
                              // only when numbering is the *dominant*
                              // pattern in this chapter (most topics have
                              // one) — a single stray numbered topic among
                              // mostly plain-titled siblings (common in
                              // Sanskrit/Hindi/Telugu extractions) must not
                              // send every following topic on a fake
                              // escalating staircase just because one
                              // earlier sibling happened to have a number.
                              const numberingIsDominant = rawDepths.length > ch.topics.length / 2
                              let lastRawDepth = baseDepth
                              return (
                                <div className="space-y-2">
                                  {ch.topics.map(t => {
                                    const parsed = topicNumberDepth(t.topic_name)
                                    const raw = parsed ?? (numberingIsDominant ? lastRawDepth + 1 : baseDepth)
                                    lastRawDepth = raw
                                    const level = Math.max(0, Math.min(raw - baseDepth, TOPIC_DEPTH_STYLES.length - 1))
                                    const depthStyle = TOPIC_DEPTH_STYLES[level]
                                    return (
                                      <div
                                        key={t.id}
                                        onClick={() => {
                                          setActiveChapterId(ch.id)
                                          setEditingTopic({ id: t.id, chapter_id: ch.id, topic_name: t.topic_name, topic_order: t.topic_order, content_text: t.content_text || '', content_pdf_url: t.content_pdf_url || '', resources: t.resources || [], questions: t.questions || [] })
                                          setTopicEditorTab('general')
                                        }}
                                        className="rounded-xl p-3 cursor-pointer transition-all group/topic border"
                                        style={{
                                          background: SURFACE,
                                          borderColor: BORDER,
                                          borderLeft: `3px solid ${depthStyle.border}`,
                                          marginLeft: level * 14,
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className={`${depthStyle.size} ${depthStyle.weight}`} style={{ color: depthStyle.text }}>
                                            {t.topic_order + 1}. {t.topic_name}
                                          </p>
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
                                        {t.subtopics && t.subtopics.length > 0 && (
                                          <ul className="mt-1.5 space-y-0.5">
                                            {t.subtopics.map((st, si) => (
                                              <li key={si} className="text-[10px] text-gray-500">— {st}</li>
                                            ))}
                                          </ul>
                                        )}
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
                                    )
                                  })}
                                </div>
                              )
                            })()}
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
                          )
                        })}
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
              <div>
                <label className={labelCls}>Semester (optional)</label>
                <input type="text" placeholder="e.g. Sem 1 — leave blank if this subject isn't split by semester" value={newChapterForm.semester} onChange={e => setNewChapterForm(prev => ({ ...prev, semester: e.target.value }))} className={inputCls} style={{ borderColor: BORDER }} />
              </div>
              <div>
                <label className={labelCls}>Book</label>
                <select value={newChapterForm.book_type} onChange={e => setNewChapterForm(prev => ({ ...prev, book_type: e.target.value as BookType }))} className={inputCls} style={{ borderColor: BORDER }}>
                  {(['textbook', 'handbook', 'workbook'] as const).map(bt => (
                    <option key={bt} value={bt}>{BOOK_TYPE_LABELS[bt]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>For</label>
                <select value={newChapterForm.audience} onChange={e => setNewChapterForm(prev => ({ ...prev, audience: e.target.value as Audience }))} className={inputCls} style={{ borderColor: BORDER }}>
                  {(['student', 'teacher', 'both'] as const).map(a => (
                    <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Book name (optional)</label>
                <input type="text" placeholder="e.g. Telugu Parimalam — only needed if this subject has 2+ books of the same type" value={newChapterForm.book_name} onChange={e => setNewChapterForm(prev => ({ ...prev, book_name: e.target.value }))} className={inputCls} style={{ borderColor: BORDER }} />
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
                    <option key={t.id} value={t.id}>{t.topic_order + 1}. {t.topic_name}</option>
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

      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-xl max-h-[85vh] flex flex-col">
            {!savingMaterial && (
              <button onClick={() => setShowMaterialModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            )}
            <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>Upload Textbooks or Handbooks</h3>
            <p className="text-xs text-gray-400 mb-4">Applies to the whole subject — visible to every school subscribed to it. Titles are taken from each file name.</p>

            {!materialTypeToUpload ? (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMaterialTypeToUpload('textbook')} className="border rounded-2xl p-5 text-left hover:bg-gray-50" style={{ borderColor: BORDER }}>
                  <FileText size={18} style={{ color: PURPLE }} />
                  <p className="text-sm font-semibold mt-2" style={{ color: INK }}>Textbook</p>
                  <p className="text-[10px] text-gray-400 mt-1">Visible to school admins, teachers, and students.</p>
                </button>
                <button onClick={() => setMaterialTypeToUpload('handbook')} className="border rounded-2xl p-5 text-left hover:bg-gray-50" style={{ borderColor: BORDER }}>
                  <FileText size={18} style={{ color: PURPLE }} />
                  <p className="text-sm font-semibold mt-2" style={{ color: INK }}>Handbook</p>
                  <p className="text-[10px] text-gray-400 mt-1">Staff-only — school admins and the subject&apos;s teachers.</p>
                </button>
              </div>
            ) : (
              <form onSubmit={handleUploadMaterial} className="flex flex-col min-h-0 flex-1">
                <div className="space-y-4 overflow-y-auto pr-1">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: '#EEEDFE', color: '#3C3489' }}>
                      {materialTypeToUpload}
                    </span>
                    {!savingMaterial && (
                      <button type="button" onClick={() => setMaterialTypeToUpload(null)} className="text-[10px] font-semibold ml-2" style={{ color: PURPLE }}>Change</button>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Files</label>
                    <input
                      type="file"
                      multiple
                      required
                      disabled={savingMaterial}
                      onChange={e => setNewMaterialFiles(Array.from(e.target.files || []))}
                      className="text-xs w-full"
                    />
                    {newMaterialFiles.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">{newMaterialFiles.length} file{newMaterialFiles.length === 1 ? '' : 's'} selected</p>
                    )}
                    {uploading && <p className="text-[10px] mt-1" style={{ color: PURPLE }}>Uploading… {uploadProgress}%</p>}
                  </div>

                  {materialUploadLog.length > 0 && (
                    <div>
                      <label className={labelCls}>Progress</label>
                      <div className="rounded-xl border p-3 space-y-0.5 max-h-40 overflow-y-auto" style={{ borderColor: BORDER, background: SURFACE }}>
                        {materialUploadLog.map((line, i) => (
                          <p key={i} className="text-[11px] font-mono" style={{ color: line.includes('✗') ? '#791F1F' : INK }}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-4 mt-2 border-t shrink-0" style={{ borderColor: '#EFEDE6' }}>
                  <button type="button" disabled={savingMaterial} onClick={() => setShowMaterialModal(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">
                    {savingMaterial ? 'Uploading…' : 'Cancel'}
                  </button>
                  <button type="submit" disabled={savingMaterial || newMaterialFiles.length === 0} className="text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50" style={{ background: PURPLE }}>
                    {savingMaterial ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {showFilesViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 relative shadow-xl max-h-[80vh] flex flex-col">
            <button onClick={() => setShowFilesViewModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>Files — {activeSubject?.subject_name}</h3>
            <p className="text-xs text-gray-400 mb-4">Textbooks and handbooks uploaded for this subject.</p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingMaterials ? (
                <div className="py-10 text-center">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: PURPLE, borderTopColor: 'transparent' }} />
                </div>
              ) : materials.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-10">No files uploaded yet — use &quot;Upload textbook / handbook&quot; to add one.</p>
              ) : (
                materials.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl p-3 border" style={{ background: SURFACE, borderColor: BORDER }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0" style={m.material_type === 'textbook' ? { background: '#E6F1FB', color: '#0C447C' } : { background: '#FAEEDA', color: '#633806' }}>
                        {m.material_type}
                      </span>
                      <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold truncate hover:underline" style={{ color: INK }}>{m.title}</a>
                    </div>
                    <button onClick={() => handleDeleteMaterial(m.id, m.title)} className="text-gray-400 hover:text-red-600 shrink-0" title="Delete file"><Trash2 size={14} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.35)' }}>
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 relative shadow-xl max-h-[85vh] flex flex-col">
            {!importRunning && (
              <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            )}
            <h3 className="text-base font-semibold" style={{ color: INK }}>Import folder — {importRootName || 'selected folder'}</h3>
            <p className="text-xs text-gray-400 mb-4">
              Writes into {category === 'extra' ? 'Extra Subjects' : selectedBoard} · Grade {selectedGrade}. Missing subjects are created automatically.
            </p>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {Object.keys(bookTypeChoices).length > 0 && (
                <div>
                  <label className={labelCls}>Book type folders found</label>
                  <div className="space-y-2">
                    {Object.entries(bookTypeChoices).map(([bt, choice]) => (
                      <div key={bt} className="flex items-center justify-between gap-2 rounded-xl border p-2.5" style={{ borderColor: BORDER }}>
                        <span className="text-xs font-semibold" style={{ color: INK }}>{bt}</span>
                        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: SURFACE }}>
                          {(['textbook', 'handbook', 'workbook'] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              disabled={importRunning}
                              onClick={() => setBookTypeChoices(prev => ({ ...prev, [bt]: t }))}
                              className="px-2.5 py-1 rounded-md text-[10px] font-bold capitalize"
                              style={{ background: choice === t ? PURPLE : 'transparent', color: choice === t ? 'white' : '#6b7280' }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Subjects detected ({importGroups.length})</label>
                <p className="text-[10px] text-gray-400 mb-2">
                  Every chapters JSON found is listed below — uncheck one to skip it, nothing is imported silently. Give a file a semester label to tag its chapters (applies whether or not you merge it with others).
                </p>
                <div className="space-y-2">
                  {importGroups.map(group => {
                    const bookTypesInGroup = Array.from(new Set(group.jsonFiles.map(f => f.bookType)))
                    return (
                      <div key={group.subjectName} className="rounded-xl border p-2.5" style={{ borderColor: BORDER }}>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.include}
                            disabled={importRunning}
                            onChange={e => setImportGroups(prev => prev.map(g => g.subjectName === group.subjectName ? { ...g, include: e.target.checked } : g))}
                            className="w-4 h-4 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold" style={{ color: INK }}>{group.subjectName}</span>
                            <span className="text-[10px] text-gray-400 ml-2">
                              {group.jsonFiles.length} chapters file{group.jsonFiles.length === 1 ? '' : 's'} · {group.books.length} PDF{group.books.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </label>

                        {group.jsonFiles.length > 0 && (
                          <div className={`mt-2.5 ml-6 space-y-3 transition-opacity ${group.include ? '' : 'opacity-40 pointer-events-none'}`}>
                            {bookTypesInGroup.map(bt => {
                              const filesOfType = group.jsonFiles.filter(f => f.bookType === bt)
                              const mergesOfType = group.merges.filter(m => m.bookType === bt)
                              const mergedIds = new Set(mergesOfType.flatMap(m => m.fileIds))
                              const unmergedFiles = filesOfType.filter(f => !mergedIds.has(f.id))
                              const eligibleForMerge = unmergedFiles.filter(f => f.include).length

                              return (
                                <div key={bt} className="space-y-1.5">
                                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{bt}</div>

                                  {unmergedFiles.map(f => (
                                    <div key={f.id} className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={f.include}
                                        disabled={importRunning}
                                        onChange={e => setImportGroups(prev => prev.map(g => g.subjectName !== group.subjectName ? g : {
                                          ...g,
                                          jsonFiles: g.jsonFiles.map(x => x.id === f.id ? { ...x, include: e.target.checked } : x),
                                        }))}
                                        className="w-3.5 h-3.5 rounded shrink-0"
                                      />
                                      <span className="text-[11px] flex-1 truncate" style={{ color: INK }}>{f.displayName}</span>
                                      <input
                                        type="text"
                                        placeholder="Semester (e.g. Sem 1)"
                                        value={f.semesterLabel}
                                        disabled={importRunning}
                                        onChange={e => setImportGroups(prev => prev.map(g => g.subjectName !== group.subjectName ? g : {
                                          ...g,
                                          jsonFiles: g.jsonFiles.map(x => x.id === f.id ? { ...x, semesterLabel: e.target.value } : x),
                                        }))}
                                        className="text-[10px] border rounded-md px-1.5 py-1 w-28 shrink-0"
                                        style={{ borderColor: BORDER }}
                                      />
                                    </div>
                                  ))}

                                  {mergesOfType.map(m => (
                                    <div key={m.id} className="rounded-lg p-2" style={{ background: SURFACE }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold" style={{ color: INK }}>
                                          Merged{m.bookName ? ` (${m.bookName})` : ''}: {m.fileNames.join(' + ')} ({m.chapterCount} chapter{m.chapterCount === 1 ? '' : 's'})
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedMergeId(prev => prev === m.id ? null : m.id)}
                                            className="text-[10px] font-medium underline"
                                            style={{ color: PURPLE }}
                                          >
                                            {expandedMergeId === m.id ? 'Hide JSON' : 'View combined JSON'}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={importRunning}
                                            onClick={() => handleUndoMerge(group.subjectName, m.id)}
                                            className="text-[10px] font-medium underline disabled:opacity-40"
                                            style={{ color: '#791F1F' }}
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      </div>
                                      {expandedMergeId === m.id && (
                                        <pre className="mt-2 text-[9px] font-mono leading-relaxed overflow-x-auto max-h-40 overflow-y-auto p-2 rounded-md bg-white border" style={{ borderColor: BORDER }}>
                                          {m.combinedJson}
                                        </pre>
                                      )}
                                    </div>
                                  ))}

                                  {eligibleForMerge >= 2 && (
                                    <button
                                      type="button"
                                      disabled={importRunning}
                                      onClick={() => handleMergeFiles(group.subjectName, bt)}
                                      className="text-[10px] font-bold underline"
                                      style={{ color: PURPLE }}
                                    >
                                      Merge {eligibleForMerge} &quot;{bt}&quot; files into one — combines their chapters into a single import, tagged by the semester label you give each one
                                    </button>
                                  )}
                                  {mergeError && mergeError.subjectName === group.subjectName && mergeError.bookType === bt && (
                                    <div className="flex items-start gap-1.5 text-[11px] rounded-lg px-2.5 py-2" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                                      ⚠️ {mergeError.message}
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
              </div>

              {importLog.length > 0 && (
                <div>
                  <label className={labelCls}>Progress</label>
                  <div className="rounded-xl border p-3 space-y-0.5 max-h-48 overflow-y-auto" style={{ borderColor: BORDER, background: SURFACE }}>
                    {importLog.map((line, i) => (
                      <p key={i} className="text-[11px] font-mono" style={{ color: line.includes('✗') ? '#791F1F' : INK }}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-2 border-t" style={{ borderColor: '#EFEDE6' }}>
              <button type="button" disabled={importRunning} onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">
                {importRunning ? 'Importing…' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={importRunning || importGroups.every(g => !g.include)}
                onClick={handleRunImport}
                className="flex items-center gap-1.5 text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                style={{ background: PURPLE }}
              >
                {importRunning && <Loader2 size={13} className="animate-spin" />}
                {importRunning ? 'Importing…' : 'Start Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  )
}
