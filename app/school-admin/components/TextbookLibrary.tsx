'use client'

import { useState, useEffect, useRef } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'

type Book = {
  id: number
  grade: string
  subject: string
  book_title: string
  file_name: string
  total_chunks: number
  total_chars: number
  uploaded_by_name: string | null
  uploaded_at: string
}

const SUBJECTS_BY_BOARD: Record<string, string[]> = {
  APSSC: ['Telugu', 'Hindi', 'English', 'Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'Computer Science'],
  CBSE:  ['English', 'Hindi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Science', 'Computer Applications', 'Sanskrit'],
  Other: ['Telugu', 'Hindi', 'English', 'Mathematics', 'Science', 'Social Studies', 'Computer Science', 'Other'],
}
const GRADES = GRADE_SEQUENCE.filter(g => /^\d+$/.test(g))

function fmt(chars: number) {
  if (chars >= 1_000_000) return (chars / 1_000_000).toFixed(1) + 'M chars'
  if (chars >= 1_000)     return (chars / 1_000).toFixed(0) + 'K chars'
  return chars + ' chars'
}

export default function TextbookLibrary({ schoolId }: { schoolId: number }) {
  const [books, setBooks]           = useState<Book[]>([])
  const [loading, setLoading]       = useState(true)
  const [filterGrade, setFilterGrade] = useState('')

  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState('')
  const [uploadOk, setUploadOk]     = useState('')
  const [progress, setProgress]     = useState(0)   // 0–100

  const [board, setBoard]           = useState('APSSC')
  const [form, setForm]             = useState({ grade: '10', subject: '', book_title: '', uploaded_by_name: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadBooks() }, [schoolId, filterGrade])

  async function loadBooks() {
    setLoading(true)
    try {
      const url = `/api/textbooks?school_id=${schoolId}${filterGrade ? `&grade=${filterGrade}` : ''}`
      const data = await fetch(url).then(r => r.json())
      setBooks(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setUploadErr('Select a PDF file first'); return }
    if (!form.grade || !form.subject) { setUploadErr('Grade and Subject are required'); return }

    setUploading(true); setUploadErr(''); setUploadOk(''); setProgress(10)

    const fd = new FormData()
    fd.append('school_id', String(schoolId))
    fd.append('grade', form.grade)
    fd.append('subject', form.subject)
    fd.append('book_title', form.book_title || file.name.replace('.pdf', ''))
    if (form.uploaded_by_name) fd.append('uploaded_by_name', form.uploaded_by_name)
    fd.append('file', file)

    try {
      // Simulate progress during upload (actual progress isn't trackable via fetch easily)
      const ticker = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 800)
      const res  = await fetch('/api/textbooks', { method: 'POST', body: fd })
      const data = await res.json()
      clearInterval(ticker)
      setProgress(100)

      if (!res.ok) {
        setUploadErr(data.error || 'Upload failed')
      } else {
        setUploadOk(`✓ Uploaded — ${data.chunks} chunks extracted from ${data.pages} pages (${fmt(data.chars)}) — AI can now use this textbook`)
        if (fileRef.current) fileRef.current.value = ''
        setForm(f => ({ ...f, book_title: '' }))
        loadBooks()
      }
    } catch (err) {
      setUploadErr('Upload failed: ' + String(err))
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Remove "${title}" from the library? This will also remove all its AI context.`)) return
    await fetch(`/api/textbooks/${id}?school_id=${schoolId}`, { method: 'DELETE' })
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  const subjects = SUBJECTS_BY_BOARD[board] ?? SUBJECTS_BY_BOARD.Other
  const gradeGroups = books.reduce<Record<string, Book[]>>((acc, b) => {
    if (!acc[b.grade]) acc[b.grade] = []
    acc[b.grade].push(b)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Textbook Library</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload class textbooks as PDFs — AI automatically uses them for homework suggestions, student Q&amp;A, lesson plans and doubt answers.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-blue-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Textbook PDF
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Board *</label>
            <select value={board} onChange={e => { setBoard(e.target.value); setForm(f => ({ ...f, subject: '' })) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {Object.keys(SUBJECTS_BY_BOARD).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Grade *</label>
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject *</label>
            <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">Select subject...</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Book Title (optional)</label>
            <input value={form.book_title} onChange={e => setForm(f => ({ ...f, book_title: e.target.value }))}
              placeholder="e.g. AP SSC Maths Textbook"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>

        {/* File drop zone */}
        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors mb-4
          ${uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
          <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm text-gray-500">
            {fileRef.current?.files?.[0]?.name ?? 'Click to select PDF'}
          </span>
          <span className="text-xs text-gray-400 mt-1">PDF only · max 50 MB · text-based (not scanned)</span>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={() => { setUploadErr(''); setUploadOk('') }} />
        </label>

        {/* Progress bar */}
        {uploading && (
          <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {uploadErr && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{uploadErr}</div>
        )}
        {uploadOk && (
          <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">{uploadOk}</div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleUpload} disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {uploading ? `Processing... ${progress}%` : 'Upload & Extract Text'}
          </button>
          <p className="text-xs text-gray-400">Text is extracted and stored — AI queries it automatically when helping students or teachers</p>
        </div>
      </div>

      {/* How AI uses it */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-5 mb-6">
        <h4 className="font-semibold text-gray-800 mb-3 text-sm">How the AI uses uploaded textbooks</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '💬', label: 'Student Q&A', desc: 'AI answers from actual textbook content' },
            { icon: '📝', label: 'Homework', desc: 'Homework questions match what\'s in the book' },
            { icon: '🎯', label: 'Doubt Answers', desc: 'Doubt explanations cite textbook material' },
            { icon: '📋', label: 'Lesson Plans', desc: 'Lesson plans built around textbook chapters' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg p-3 border border-violet-100">
              <p className="text-xl mb-1">{item.icon}</p>
              <p className="text-xs font-semibold text-gray-800">{item.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Library list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-800">Uploaded Books ({books.length})</h3>
          </div>
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All grades</option>
            {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : books.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            <p className="text-3xl mb-2">📚</p>
            <p>No textbooks uploaded yet</p>
            <p className="text-xs text-gray-300 mt-1">Upload your first PDF above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {Object.keys(gradeGroups).sort((a, b) => parseInt(a) - parseInt(b)).map(grade => (
              <div key={grade}>
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade {grade}</span>
                </div>
                {gradeGroups[grade].map(book => (
                  <div key={book.id} className="px-5 py-4 flex items-start justify-between hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{book.book_title || book.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">{book.subject}</span>
                          <span className="text-xs text-gray-400">{book.total_chunks} chunks · {fmt(book.total_chars)}</span>
                          {book.uploaded_by_name && (
                            <span className="text-xs text-gray-400">· by {book.uploaded_by_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5">{new Date(book.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        AI Ready
                      </span>
                      <button onClick={() => handleDelete(book.id, book.book_title || book.file_name)}
                        className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded-lg transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
