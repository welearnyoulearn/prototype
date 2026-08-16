'use client'

import { useEffect, useMemo, useState } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'

type LibraryRow = {
  subject_id: number
  board: string
  grade: string
  subject_name: string
  category: string
  material_id: number
  material_type: 'textbook' | 'handbook'
  title: string
  file_url: string
  created_at: string
}

type SubjectGroup = {
  key: string
  board: string
  grade: string
  subject_name: string
  category: string
  materials: LibraryRow[]
}

const TYPE_LABEL: Record<string, string> = { textbook: 'Text Book', handbook: 'Hand Book' }
const TYPE_STYLE: Record<string, string> = {
  textbook: 'bg-blue-50 text-blue-700 border-blue-200',
  handbook: 'bg-amber-50 text-amber-700 border-amber-200',
}

function gradeLabel(grade: string) {
  return /^\d+$/.test(grade) ? `Grade ${grade}` : grade
}

// WLYL Digital Library — a standalone, read-only browsing view over every
// textbook/handbook already uploaded (see master_subject_materials), grouped
// Board -> Grade -> Subject the same way the source syllabus JSON files are
// organised. Self-contained (own fetch, own styling) so it drops unmodified
// into every portal's nav — only `apiUrl` changes per portal.
export default function DigitalLibrary({ apiUrl }: { apiUrl: string }) {
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [board, setBoard] = useState('')
  const [grade, setGrade] = useState('')

  useEffect(() => { loadLibrary() }, [apiUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLibrary() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(apiUrl)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load the library')
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the library')
    } finally {
      setLoading(false)
    }
  }

  const boards = useMemo(() => Array.from(new Set(rows.map(r => r.board))).sort(), [rows])
  const grades = useMemo(() => {
    const present = new Set(rows.map(r => r.grade))
    return GRADE_SEQUENCE.filter(g => present.has(g))
  }, [rows])

  const groups = useMemo<SubjectGroup[]>(() => {
    const byKey = new Map<string, SubjectGroup>()
    for (const r of rows) {
      const key = `${r.board}::${r.grade}::${r.subject_name}`
      let g = byKey.get(key)
      if (!g) {
        g = { key, board: r.board, grade: r.grade, subject_name: r.subject_name, category: r.category, materials: [] }
        byKey.set(key, g)
      }
      g.materials.push(r)
    }
    return Array.from(byKey.values())
  }, [rows])

  const filtered = groups.filter(g => {
    if (board && g.board !== board) return false
    if (grade && g.grade !== grade) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchesSubject = g.subject_name.toLowerCase().includes(q)
      const matchesMaterial = g.materials.some(m => m.title.toLowerCase().includes(q))
      if (!matchesSubject && !matchesMaterial) return false
    }
    return true
  })

  const byBoard = new Map<string, SubjectGroup[]>()
  for (const g of filtered) {
    const list = byBoard.get(g.board) ?? []
    list.push(g)
    byBoard.set(g.board, list)
  }
  for (const list of byBoard.values()) {
    list.sort((a, b) => GRADE_SEQUENCE.indexOf(a.grade) - GRADE_SEQUENCE.indexOf(b.grade) || a.subject_name.localeCompare(b.subject_name))
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">WLYL Digital Library</h2>
        <p className="text-sm text-gray-500 mt-0.5">Browse every textbook and handbook, organised by board, grade and subject.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subject or book title..."
          data-testid="library-search"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {boards.length > 1 && (
          <select value={board} onChange={e => setBoard(e.target.value)} data-testid="library-board-filter"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none">
            <option value="">All boards</option>
            {boards.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {grades.length > 1 && (
          <select value={grade} onChange={e => setGrade(e.target.value)} data-testid="library-grade-filter"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none">
            <option value="">All grades</option>
            {grades.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading library...</div>
      ) : error ? (
        <div className="py-16 text-center text-red-500 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <p className="text-3xl mb-2">📚</p>
          <p>{rows.length === 0 ? 'No materials have been uploaded to the library yet.' : 'Nothing matches your filters.'}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byBoard.entries()).map(([b, subjectGroups]) => (
            <div key={b}>
              {byBoard.size > 1 && (
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{b}</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjectGroups.map(g => (
                  <div key={g.key} className="bg-white rounded-xl border border-gray-200 p-4" data-testid="library-subject-card">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900 text-sm">{g.subject_name}</p>
                      <span className="text-xs text-gray-400">{gradeLabel(g.grade)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.materials.map(m => (
                        <a key={m.material_id} href={m.file_url} target="_blank" rel="noopener noreferrer"
                          data-testid="library-material-link"
                          className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg hover:bg-gray-50 group">
                          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <span className="flex-1 text-gray-700 group-hover:text-blue-700 group-hover:underline truncate">{m.title}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${TYPE_STYLE[m.material_type]}`}>
                            {TYPE_LABEL[m.material_type] ?? m.material_type}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
