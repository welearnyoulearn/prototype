'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GRADE_SEQUENCE } from '@/lib/grades'
import { ArrowUpRight, BookOpen, LibraryBig, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEmptyState, StudentPageIntro } from '@/app/student/components/StudentExperience'

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

// A small curated set of "book spine" colors, assigned deterministically per
// subject name (same subject always gets the same color) — gives the grid a
// bookshelf feel instead of a wall of identical white cards.
const SPINE_COLORS = [
  { bar: '#dc2626', tint: '#fef2f2' }, // red
  { bar: '#ea580c', tint: '#fff7ed' }, // orange
  { bar: '#ca8a04', tint: '#fefce8' }, // amber
  { bar: '#16a34a', tint: '#f0fdf4' }, // green
  { bar: '#0891b2', tint: '#ecfeff' }, // cyan
  { bar: '#2563eb', tint: '#eff6ff' }, // blue
  { bar: '#7c3aed', tint: '#f5f3ff' }, // violet
  { bar: '#db2777', tint: '#fdf2f8' }, // pink
]
function spineFor(subject: string) {
  let hash = 0
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) | 0
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length]
}

// WLYL Digital Library — a standalone, read-only browsing view over every
// textbook/handbook already uploaded (see master_subject_materials), grouped
// Board -> Grade -> Subject the same way the source syllabus JSON files are
// organised. Self-contained (own fetch, own styling) so it drops unmodified
// into every portal's nav — only `apiUrl` changes per portal.
export default function DigitalLibrary({ apiUrl, experience = 'shared' }: { apiUrl: string; experience?: 'student' | 'shared' }) {
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
      {experience === 'student' ? (
        <StudentPageIntro eyebrow="Study resources" title="Digital library" description="Browse the textbooks and handbooks your school has made available, organised by subject." aside={
          <div className="flex items-center gap-2 text-xs font-medium text-[#68736b]"><LibraryBig size={17} className="text-[#a85f16]" aria-hidden="true" />School collection</div>
        } />
      ) : (
        <div className="mb-6"><h2 className="text-xl font-bold text-gray-900">WLYL Digital Library</h2><p className="text-sm text-gray-500 mt-0.5">Browse every textbook and handbook, organised by board, grade and subject.</p></div>
      )}

      <div className="flex flex-wrap items-center gap-3 my-6">
        <label className="relative flex min-w-[200px] flex-1 items-center">
          <Search size={16} className="pointer-events-none absolute left-3 text-[#7a837c]" aria-hidden="true" />
          <span className="sr-only">Search the library</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject or book title" data-testid="library-search" className="w-full border border-gray-200 rounded-md py-2 pl-10 pr-3 text-sm focus:outline-none" />
        </label>
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
        <div className="space-y-4 py-5" role="status" aria-live="polite" aria-busy="true"><span className="sr-only">Preparing your library…</span><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-md" />)}</div></div>
      ) : error ? (
        <div role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-5 text-sm text-red-800"><p>We couldn’t open the library. {error}</p><button type="button" onClick={loadLibrary} className="mt-3 min-h-10 font-semibold underline underline-offset-4">Try again</button></div>
      ) : filtered.length === 0 ? (
        experience === 'student' ? <StudentEmptyState icon={<BookOpen size={22} />} title={rows.length === 0 ? 'No library materials yet' : 'No matching books'} description={rows.length === 0 ? 'Your school has not added any textbooks or handbooks to this library yet.' : 'Try a different search term or clear one of the filters.'} /> : <div className="py-16 text-center text-muted-foreground text-sm"><p>{rows.length === 0 ? 'No materials have been uploaded to the library yet.' : 'Nothing matches your filters.'}</p></div>
      ) : (
        <div className="space-y-8">
          {Array.from(byBoard.entries()).map(([b, subjectGroups]) => (
            <div key={b}>
              {byBoard.size > 1 && (
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">{b}</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjectGroups.map(g => {
                  const spine = spineFor(g.subject_name)
                  return (
                    <motion.div
                      key={g.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="bg-white rounded-md border border-border overflow-hidden"
                      data-testid="library-subject-card"
                    >
                      <div className="h-1.5" style={{ background: spine.bar }} />
                      <div className="p-4" style={{ background: `linear-gradient(180deg, ${spine.tint} 0%, white 60%)` }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-900 text-sm">{g.subject_name}</p>
                          <span className="text-xs text-muted-foreground">{gradeLabel(g.grade)}</span>
                        </div>
                        <div className="space-y-1.5">
                          {g.materials.map(m => (
                            <a key={m.material_id} href={m.file_url} target="_blank" rel="noopener noreferrer"
                              data-testid="library-material-link"
                              className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg hover:bg-white/70 group">
                              <svg className="w-4 h-4 shrink-0" style={{ color: spine.bar }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                              <span className="flex-1 text-gray-700 group-hover:text-gray-900 group-hover:underline truncate">{m.title}</span><ArrowUpRight size={14} className="shrink-0 text-gray-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${TYPE_STYLE[m.material_type]}`}>
                                {TYPE_LABEL[m.material_type] ?? m.material_type}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
