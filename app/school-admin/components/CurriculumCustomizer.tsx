'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Plus, X, ChevronDown, ChevronRight,
  Check, Sparkles, Trash2,
} from 'lucide-react'
import { INK, TEAL, BORDER, SURFACE } from '@/app/components/ulearn/theme'

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
  category?: 'academic' | 'extra'
  created_at: string
  // Only the count is used here (Resync diff, sidebar "N chapters" label) —
  // school admin no longer browses chapter/topic content directly; that's
  // exclusively each subject's assigned teacher's job via the Syllabus tab.
  chapters?: { id: number }[]
  master_chapter_count?: number
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

const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

// Matches platform-admin's curriculum page — Extra Subjects are filed under
// this fixed pseudo-board in master_subjects, invisible to the user.
const EXTRA_BOARD = 'EXTRA'

// The board codes the Subscribe modal's dropdown actually offers.
const VALID_CURRICULUM_BOARDS = ['CBSE', 'AP_SSC', 'TS_SSC']

export default function CurriculumCustomizer({ schoolId }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])
  const [deletingSubjectId, setDeletingSubjectId] = useState<number | null>(null)

  // Academic Years state
  const [academicYears, setAcademicYears] = useState<{ id: number; label: string; is_current: boolean }[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [subscribeYear, setSubscribeYear] = useState<string>('')
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({})

  // Year-rollover carry-forward prompt — subjects that existed in the most
  // recent PRIOR year but have no row yet in the currently selected year.
  // Surfaced as a per-subject choice: copy last year's content as-is (keeps
  // any custom chapters/topics teachers added), or subscribe fresh from the
  // master template (picks up any master-catalog updates, starts clean).
  // Only computed when selectedYear is the most recent year with any data —
  // there's no "missing from this year" prompt to show for a year that isn't
  // the newest one being opened for the first time.
  const [priorYearLabel, setPriorYearLabel] = useState<string>('')
  const [carryForwardCandidates, setCarryForwardCandidates] = useState<Subject[]>([])
  const [dismissedCarryForward, setDismissedCarryForward] = useState(false)

  // Bulk carry-forward modal — a grade-then-subjects picker so a school with
  // many classes/subjects (e.g. 10 grades × 7 subjects = 70 candidates)
  // doesn't have to click a separate "Copy from last year" button per
  // subject one at a time. Step 1 picks which grade to roll forward, step 2
  // checks which of that grade's carried-over subjects to actually copy —
  // grade, not class, because copy-from-year operates on (subject, grade)
  // pairs, same as a fresh Subscribe; which classes actually get taught a
  // subject is a separate Class Management decision either way.
  const [showCarryForwardModal, setShowCarryForwardModal] = useState(false)
  const [carryForwardStep, setCarryForwardStep] = useState<'grade' | 'subjects'>('grade')
  const [carryForwardGrade, setCarryForwardGrade] = useState<string>('')
  const [carryForwardSelectedIds, setCarryForwardSelectedIds] = useState<number[]>([])
  const [bulkCopying, setBulkCopying] = useState(false)
  const [bulkCopyError, setBulkCopyError] = useState('')

  // First-click chooser when Subscribe is opened while carry-forward
  // candidates exist for this year — "clone fresh from the master
  // template" vs "copy last year's content as-is" are different enough
  // actions (and the second one is now a whole grade/subject picker of its
  // own, not a single click) that they get a beat to choose between rather
  // than always landing straight in the Subscribe-from-template modal.
  const [showSubscribeChooser, setShowSubscribeChooser] = useState(false)

  // Class Syllabus Setup — READ-ONLY status per class for the active
  // subject. Admin sees which classes have curated their own selection and
  // what it currently is; editing that selection stays exclusive to each
  // class's own assigned teacher via the Setup screen in Syllabus Tracking.
  const [setupStatusRows, setSetupStatusRows] = useState<{
    class_id: number; grade: string; section: string
    setup_completed_at: string | null; setup_by_name: string | null
    active_chapters: number; active_topics: number
  }[]>([])
  const [setupStatusTotals, setSetupStatusTotals] = useState<{ total_chapters: number; total_topics: number } | null>(null)
  const [setupStatusLoading, setSetupStatusLoading] = useState(false)
  const [expandedClassDetail, setExpandedClassDetail] = useState<number | null>(null)
  const [classDetailTree, setClassDetailTree] = useState<{
    school_chapter_id: number; chapter_name: string; chapter_order: number; is_custom: boolean; is_active: boolean
    semester_label: string | null
    topics: { school_topic_id: number; topic_name: string; topic_order: number; is_custom: boolean; is_active: boolean }[]
  }[] | null>(null)
  const [classDetailSemesterMode, setClassDetailSemesterMode] = useState(false)
  const [classDetailSemesterCount, setClassDetailSemesterCount] = useState<number | null>(null)
  const [activeClassDetailSemester, setActiveClassDetailSemester] = useState('')
  const [classDetailLoading, setClassDetailLoading] = useState(false)

  // Classes state — used for the custom-subject grade dropdown. Subscribing
  // now auto-assigns to every existing class of the subscribed grade
  // server-side (POST /api/school/subscribe), so this no longer needs a
  // per-class selection UI in the Subscribe modal.
  const [classes, setClasses] = useState<{ id: number; grade: string; section: string }[]>([])

  // Modals and form state
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  // Add Custom Subject — always available regardless of whether the school
  // has subscribed to any master-catalog subjects. Just subject_name +
  // grade; chapters/topics are the teacher's job via the syllabus bootstrap
  // flows (POST /api/syllabus/chapters, /api/school/syllabus/bulk-import,
  // /api/school/syllabus/bootstrap-chapters).
  const [showCustomSubjectModal, setShowCustomSubjectModal] = useState(false)
  const [customSubjectName, setCustomSubjectName] = useState('')
  const [customSubjectGrade, setCustomSubjectGrade] = useState('')
  const [creatingCustomSubject, setCreatingCustomSubject] = useState(false)
  const [customSubjectError, setCustomSubjectError] = useState('')
  const [masterSubjects, setMasterSubjects] = useState<MasterSubject[]>([])
  const [subscribing, setSubscribing] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [selectedMasterIds, setSelectedMasterIds] = useState<string[]>([])
  const [filterCategory, setFilterCategory] = useState<'academic' | 'extra'>('academic')
  // Defaults to CBSE until the school's own registered board loads (see the
  // effect below) — CBSE was a silent trap here: a school actually on
  // AP_SSC/TS_SSC that opened Subscribe without noticing this dropdown would
  // subscribe under the wrong board, creating a school_subjects row with no
  // real master-catalog content behind it (no textbooks/handbooks, since
  // those are uploaded per board). Seeding from the school's real board
  // removes the trap for the common case of never touching this field.
  const [filterBoard, setFilterBoard] = useState('CBSE')
  const [filterGrade, setFilterGrade] = useState('10')

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

  // Seed the Subscribe modal's board dropdown from the school's own
  // registered board, so it stops defaulting to a hardcoded 'CBSE' — a real
  // school on this system was accidentally subscribed under CBSE this way,
  // leaving its subjects permanently unlinked from any real master-catalog
  // content (which is uploaded per board) because no CBSE catalog exists for
  // that grade/subject. Only applies when schools.board is one of the three
  // curriculum board codes this dropdown actually offers — that field is
  // free text elsewhere (CBSE/ICSE/State Board/...) and not guaranteed to
  // match, so an unrecognized value just leaves the CBSE default in place
  // rather than silently selecting something the dropdown doesn't offer.
  useEffect(() => {
    fetch(`/api/schools/${schoolId}`)
      .then(r => r.json())
      .then((d: { board?: string | null }) => {
        if (d.board && VALID_CURRICULUM_BOARDS.includes(d.board)) {
          setFilterBoard(d.board)
        }
      })
      .catch(() => {})
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
    setDismissedCarryForward(false)
    loadSchoolSubjects(undefined, year)
  }

  // Whenever the selected year is the MOST RECENT year (i.e. the admin just
  // opened the newest academic year, whether that's the actual "current" one
  // or simply the newest one on record), check the immediately prior year
  // for subjects that have no counterpart yet in this one — those are the
  // carry-forward candidates the prompt below offers a choice for. Not shown
  // for any older year being revisited, since there's nothing to "roll into"
  // there.
  useEffect(() => {
    if (loading || !selectedYear || academicYears.length === 0) { setCarryForwardCandidates([]); setPriorYearLabel(''); return }
    const isNewestYear = academicYears[0]?.label === selectedYear
    const prior = academicYears[1]
    if (!isNewestYear || !prior) { setCarryForwardCandidates([]); setPriorYearLabel(''); return }
    setPriorYearLabel(prior.label)
    fetch(`/api/school/subjects?school_id=${schoolId}&academic_year=${prior.label}`)
      .then(r => r.json())
      .then(data => {
        const priorSubjects: Subject[] = data.subjects || []
        const currentKeys = new Set(subjects.map(s => `${s.grade}::${s.subject_name}`))
        const missing = priorSubjects.filter(s => !currentKeys.has(`${s.grade}::${s.subject_name}`))
        setCarryForwardCandidates(missing)
      })
      .catch(() => setCarryForwardCandidates([]))
  }, [loading, selectedYear, academicYears, subjects, schoolId])

  // Grades that actually have at least one pending carry-forward subject —
  // what the modal's step-1 grade picker offers.
  const carryForwardGrades = Array.from(new Set(carryForwardCandidates.map(c => c.grade))).sort()

  function openCarryForwardModal() {
    setBulkCopyError('')
    setCarryForwardSelectedIds([])
    setCarryForwardGrade(carryForwardGrades[0] || '')
    setCarryForwardStep('grade')
    setShowCarryForwardModal(true)
  }

  // Bulk-copies every checked subject sequentially (same one-at-a-time
  // pattern as handleSubscribe's multi-select submit, for the same reason:
  // a partial failure only leaves the not-yet-copied ones still selected,
  // so retrying is safe and never re-submits — and re-errors on — one
  // that already succeeded).
  const handleBulkCopyFromPriorYear = async () => {
    if (carryForwardSelectedIds.length === 0) return
    setBulkCopying(true)
    setBulkCopyError('')
    const remaining = [...carryForwardSelectedIds]
    let lastSchoolSubjectId: number | undefined
    try {
      while (remaining.length > 0) {
        const sourceId = remaining[0]
        const res = await fetch('/api/school/subjects/copy-from-year', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, source_school_subject_id: sourceId, target_academic_year: selectedYear }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        lastSchoolSubjectId = data.school_subject_id
        setCarryForwardCandidates(prev => prev.filter(s => s.id !== sourceId))
        remaining.shift()
        setCarryForwardSelectedIds([...remaining])
      }
      setSuccess(
        carryForwardSelectedIds.length === 1
          ? 'Copied last year’s syllabus for this subject.'
          : `Copied last year’s syllabus for ${carryForwardSelectedIds.length} subjects.`
      )
      setShowCarryForwardModal(false)
      await loadSchoolSubjects(lastSchoolSubjectId, selectedYear)
    } catch (err: unknown) {
      const done = carryForwardSelectedIds.length - remaining.length
      setBulkCopyError(
        (err instanceof Error ? err.message : 'Failed to copy subject') +
          (done > 0 ? ` (${done} of ${carryForwardSelectedIds.length} subjects copied before this failure)` : '')
      )
      if (lastSchoolSubjectId !== undefined) {
        await loadSchoolSubjects(lastSchoolSubjectId, selectedYear)
      }
    } finally {
      setBulkCopying(false)
    }
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

  // Master subject list is scoped to a single board+grade+category — clear
  // stale selections when the filters change or the modal opens/closes, so a
  // submit never mixes subjects picked under a previous grade/board.
  useEffect(() => {
    setSelectedMasterIds([])
  }, [showSubscribeModal, filterCategory, filterBoard, filterGrade])

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

  // Class Syllabus Setup — per-class status for the active subject, read-only.
  useEffect(() => {
    setExpandedClassDetail(null)
    setClassDetailTree(null)
    if (!activeSubject) { setSetupStatusRows([]); setSetupStatusTotals(null); return }
    setSetupStatusLoading(true)
    fetch(`/api/syllabus/setup/status?school_id=${schoolId}&school_subject_id=${activeSubject.id}`)
      .then(r => r.json())
      .then(data => {
        setSetupStatusRows(Array.isArray(data.classes) ? data.classes : [])
        setSetupStatusTotals(
          typeof data.total_chapters === 'number'
            ? { total_chapters: data.total_chapters, total_topics: data.total_topics }
            : null
        )
      })
      .catch(() => { setSetupStatusRows([]); setSetupStatusTotals(null) })
      .finally(() => setSetupStatusLoading(false))
  }, [activeSubject, schoolId])

  async function toggleClassDetail(classId: number, subjectName: string) {
    if (expandedClassDetail === classId) { setExpandedClassDetail(null); setClassDetailTree(null); return }
    setExpandedClassDetail(classId)
    setClassDetailLoading(true)
    setClassDetailTree(null)
    setClassDetailSemesterMode(false)
    setClassDetailSemesterCount(null)
    setActiveClassDetailSemester('')
    try {
      // Must pass the year the admin is actually viewing (selectedYear) —
      // without it, the route defaults to the school's CURRENT year, which
      // may have no school_subjects row at all for a subject being viewed
      // under an older/different year here (a genuine "Subject not found"
      // trap otherwise).
      const yearParam = selectedYear ? `&academic_year=${encodeURIComponent(selectedYear)}` : ''
      const res = await fetch(`/api/syllabus/setup?school_id=${schoolId}&class_id=${classId}&subject=${encodeURIComponent(subjectName)}${yearParam}`)
      const data = await res.json()
      setClassDetailTree(Array.isArray(data.chapters) ? data.chapters : [])
      setClassDetailSemesterMode(!!data.semester_mode)
      setClassDetailSemesterCount(typeof data.semester_count === 'number' ? data.semester_count : null)
    } catch {
      setClassDetailTree([])
    } finally {
      setClassDetailLoading(false)
    }
  }

  const handleSubscribe = async () => {
    if (selectedMasterIds.length === 0) return
    setSubscribing(true)
    setError('')
    setSuccess('')
    const remaining = [...selectedMasterIds]
    let lastSchoolSubjectId: number | undefined
    try {
      while (remaining.length > 0) {
        const masterId = remaining[0]
        const res = await fetch('/api/school/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            master_subject_id: parseInt(masterId),
            academic_year: subscribeYear || selectedYear,
          })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        lastSchoolSubjectId = data.school_subject_id
        // Drop each subject from the pending selection as soon as it clones
        // successfully, so a later failure only leaves the un-cloned ones
        // selected — retrying won't re-submit (and error on) ones already done.
        remaining.shift()
        setSelectedMasterIds([...remaining])
      }

      setSuccess(
        selectedMasterIds.length === 1
          ? 'Successfully subscribed and cloned curriculum!'
          : `Successfully subscribed and cloned ${selectedMasterIds.length} subjects!`
      )
      setShowSubscribeModal(false)
      // Load and set active to last new subject
      await loadSchoolSubjects(lastSchoolSubjectId, subscribeYear || selectedYear)
    } catch (err: unknown) {
      const done = selectedMasterIds.length - remaining.length
      setError(
        (err instanceof Error ? err.message : 'Failed to subscribe to subject') +
          (done > 0 ? ` (${done} of ${selectedMasterIds.length} subjects cloned before this failure)` : '')
      )
      if (lastSchoolSubjectId !== undefined) {
        await loadSchoolSubjects(lastSchoolSubjectId, subscribeYear || selectedYear)
      }
    } finally {
      setSubscribing(false)
    }
  }

  const handleCreateCustomSubject = async () => {
    const name = customSubjectName.trim()
    if (!name || !customSubjectGrade) return
    setCreatingCustomSubject(true)
    setCustomSubjectError('')
    try {
      const res = await fetch('/api/school/subjects/create-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          grade: customSubjectGrade,
          subject_name: name,
          academic_year: selectedYear,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create subject')
      setSuccess(`"${name}" added for Grade ${customSubjectGrade}. Assign it to a class in Class Management, then the teacher can build out chapters.`)
      setShowCustomSubjectModal(false)
      setCustomSubjectName('')
      setCustomSubjectGrade('')
      await loadSchoolSubjects(data.subject.id)
    } catch (err: unknown) {
      setCustomSubjectError(err instanceof Error ? err.message : 'Failed to create subject')
    } finally {
      setCreatingCustomSubject(false)
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

  // Delete a subscribed subject — refused server-side (409) while any class
  // has real teaching data against it (a completed Class Syllabus Setup, or
  // a topic marked taught); see app/api/school/subjects/[id]/route.ts. A
  // freshly subscribed/never-set-up subject deletes cleanly.
  const handleDeleteSubject = async (subject: Subject) => {
    if (!window.confirm(`Delete "${subject.subject_name}" (Grade ${subject.grade})? This removes it from your school — it can't be undone.`)) return
    setDeletingSubjectId(subject.id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/school/subjects/${subject.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete subject')
      setSubjects(prev => {
        const next = prev.filter(s => s.id !== subject.id)
        setActiveSubject(current => {
          if (current?.id !== subject.id) return current
          return next[0] || null
        })
        return next
      })
      setSuccess(`"${subject.subject_name}" was deleted.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject')
    } finally {
      setDeletingSubjectId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Subject Header / Action Group */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border" style={{ borderColor: BORDER }}>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" style={{ color: INK }}>
            <BookOpen size={20} style={{ color: TEAL }} /> Syllabus Customizer
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Subscribe to board subject templates, add custom subjects, or remove ones you no longer need. Chapters and topics are managed by each subject&apos;s assigned teacher from their Syllabus tab.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid="curriculum-add-custom-subject-btn"
            onClick={() => { setCustomSubjectError(''); setShowCustomSubjectModal(true) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl border"
            style={{ borderColor: BORDER, color: INK }}
          >
            <Plus size={14} /> Add Custom Subject
          </button>
          <button
            data-testid="curriculum-subscribe-open-btn"
            onClick={() => (carryForwardCandidates.length > 0 ? setShowSubscribeChooser(true) : setShowSubscribeModal(true))}
            className="flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm"
            style={{ background: TEAL }}
          >
            <Sparkles size={14} /> Subscribe to Board Subject
          </button>
        </div>
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

      {/* New-academic-year carry-forward nudge — subjects present last year
          but not yet in this one. Deliberately a slim one-line banner, not a
          per-subject list: a school with many grades/subjects can have
          dozens of these, and a row-per-subject list (the previous version
          of this banner) didn't scale. Its only action opens the bulk
          grade→subjects picker modal below. */}
      {!dismissedCarryForward && carryForwardCandidates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              {carryForwardCandidates.length} subject{carryForwardCandidates.length === 1 ? '' : 's'} from {priorYearLabel} {carryForwardCandidates.length === 1 ? "isn't" : "aren't"} in {selectedYear} yet
            </h3>
            <p className="text-xs text-amber-700 mt-0.5">
              Almost every school&apos;s syllabus barely changes year to year — copy last year&apos;s content as-is, or subscribe fresh to pick up any board updates.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              data-testid="curriculum-carry-forward-open-btn"
              onClick={openCarryForwardModal}
              className="text-xs font-semibold px-4 py-2 rounded-xl text-white"
              style={{ background: TEAL }}
            >
              Copy from {priorYearLabel}
            </button>
            <button
              data-testid="curriculum-carry-forward-dismiss"
              onClick={() => setDismissedCarryForward(true)}
              className="text-amber-500 hover:text-amber-700"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
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
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              data-testid="curriculum-subscribe-open-btn-empty"
              onClick={() => setShowSubscribeModal(true)}
              className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm"
              style={{ background: TEAL }}
            >
              Choose & Subscribe to Subject
            </button>
            <button
              data-testid="curriculum-add-custom-subject-btn-empty"
              onClick={() => { setCustomSubjectError(''); setShowCustomSubjectModal(true) }}
              className="text-xs font-semibold px-5 py-2.5 rounded-xl border"
              style={{ borderColor: BORDER, color: INK }}
            >
              Add Custom Subject
            </button>
          </div>
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
                                <div
                                  key={s.id}
                                  className="w-full flex items-stretch gap-1 rounded-lg transition-all border"
                                  style={{
                                    background: isActive ? '#E7F3F4' : 'transparent',
                                    borderColor: isActive ? TEAL : 'transparent',
                                  }}
                                >
                                  <button
                                    data-testid={`curriculum-subject-select-${s.id}`}
                                    onClick={() => setActiveSubject(s)}
                                    className="flex-1 min-w-0 text-left p-2.5 text-xs flex flex-col gap-1"
                                    style={{ color: isActive ? TEAL : '#6b7280' }}
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
                                  <button
                                    type="button"
                                    data-testid={`curriculum-delete-subject-btn-${s.id}`}
                                    onClick={() => handleDeleteSubject(s)}
                                    disabled={deletingSubjectId === s.id}
                                    aria-label={`Delete ${s.subject_name}`}
                                    title="Delete subject"
                                    className="flex-shrink-0 px-2 flex items-center justify-center text-gray-300 hover:text-red-500 disabled:opacity-50 transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
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
                <li>Chapters, topics, and tasks are created by each subject&apos;s assigned teacher from their Syllabus tab.</li>
                <li>A subject can only be deleted while no class has completed Syllabus Setup or marked any topic taught for it.</li>
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
                </div>

                {/* Class Syllabus Setup — read-only per-class status. Admin
                    sees which classes have curated their own chapter/topic
                    selection and can drill into what each one currently has
                    active, but never edits it here — that stays exclusive
                    to each class's own assigned teacher. */}
                <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
                  <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Class Syllabus Setup</h5>
                  <p className="text-xs text-gray-400 mb-3">Which classes have curated this subject for themselves — view only, set by each class&apos;s own teacher.</p>
                  {setupStatusLoading ? (
                    <p className="text-xs text-gray-400 py-2">Loading…</p>
                  ) : setupStatusRows.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">No classes found for Grade {activeSubject.grade}.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {setupStatusRows.map(row => {
                        const isDone = !!row.setup_completed_at
                        const isSelected = expandedClassDetail === row.class_id
                        return (
                          <button
                            key={row.class_id}
                            onClick={() => toggleClassDetail(row.class_id, activeSubject.subject_name)}
                            data-testid={`curriculum-setup-status-${row.class_id}`}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left rounded-xl border hover:bg-gray-50"
                            style={{ borderColor: isSelected ? TEAL : BORDER, background: isSelected ? '#EDF9F6' : 'white' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: INK }}>Grade {row.grade} – {row.section}</span>
                              {isDone ? (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#085041' }}>
                                  Set up{row.setup_by_name ? ` by ${row.setup_by_name}` : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: SURFACE, color: '#9ca3af' }}>
                                  Not set up yet — showing everything
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[11px] text-gray-400">
                                {row.active_chapters}/{setupStatusTotals?.total_chapters ?? row.active_chapters} chapters · {row.active_topics}/{setupStatusTotals?.total_topics ?? row.active_topics} topics
                              </span>
                              <ChevronRight size={13} className="text-gray-400" style={{ transform: isSelected ? 'rotate(90deg)' : undefined }} />
                            </div>
                          </button>
                        )
                      })}
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

                {/* Read-only syllabus for whichever class is selected above —
                    always the same visual the teacher sees in their own
                    tracking view (Semester pill tabs when Setup ran in
                    Semester Wise mode, active-only chapters/topics), fixed
                    in one place below Textbooks & Handbooks rather than
                    expanding inline under the clicked row. Live off the same
                    GET /api/syllabus/setup fetch a class-row click already
                    triggers, so it reflects the teacher's current Setup
                    immediately — including for student/parent, who read the
                    identical underlying visibility tables. Read-only: admin
                    never edits here, only the class's own teacher can. */}
                {expandedClassDetail != null && (() => {
                  const selectedRow = setupStatusRows.find(r => r.class_id === expandedClassDetail)
                  const tree = classDetailTree ?? []
                  const activeChapters = tree.filter(ch => ch.is_active).sort((a, b) => a.chapter_order - b.chapter_order)
                  const inactiveChapters = tree.filter(ch => !ch.is_active).sort((a, b) => a.chapter_order - b.chapter_order)
                  const semesterChoices = classDetailSemesterMode && classDetailSemesterCount
                    ? Array.from({ length: classDetailSemesterCount }, (_, i) => `Semester ${i + 1}`)
                    : []
                  const effectiveSemester = semesterChoices.includes(activeClassDetailSemester)
                    ? activeClassDetailSemester
                    : (semesterChoices[0] || '')
                  const visibleChapters = semesterChoices.length > 0
                    ? activeChapters.filter(ch => ch.semester_label === effectiveSemester)
                    : activeChapters
                  return (
                    <div className="bg-white border rounded-2xl p-5 space-y-3" style={{ borderColor: BORDER }}>
                      <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {selectedRow ? `Grade ${selectedRow.grade} – ${selectedRow.section}` : 'Class'}&apos;s Syllabus
                      </h5>
                      {classDetailLoading ? (
                        <p className="text-xs text-gray-400">Loading selection…</p>
                      ) : tree.length === 0 ? (
                        <p className="text-xs text-gray-400">No chapters in this subject yet.</p>
                      ) : (
                        <>
                          {semesterChoices.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                              {semesterChoices.map(label => {
                                const active = label === effectiveSemester
                                const count = activeChapters.filter(ch => ch.semester_label === label).length
                                return (
                                  <button key={label} type="button"
                                    onClick={() => setActiveClassDetailSemester(label)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                                    style={{ background: active ? TEAL : 'white', color: active ? 'white' : TEAL, borderColor: active ? TEAL : BORDER }}>
                                    {label} <span style={{ opacity: 0.75 }}>({count})</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}

                          {visibleChapters.length === 0 ? (
                            <p className="text-xs text-gray-400">No active chapters in this semester.</p>
                          ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {visibleChapters.map(ch => (
                                <div key={ch.school_chapter_id} className="rounded-xl border p-3" style={{ borderColor: BORDER, background: SURFACE }}>
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <span className="text-xs font-semibold" style={{ color: INK }}>{ch.chapter_name}</span>
                                    <span className="text-[10px] text-gray-400 flex-shrink-0">{ch.topics.filter(t => t.is_active).length}/{ch.topics.length} topics</span>
                                  </div>
                                  <div className="space-y-1">
                                    {ch.topics.filter(t => t.is_active).sort((a, b) => a.topic_order - b.topic_order).map(t => (
                                      <div key={t.school_topic_id} className="text-[11px] px-2 py-1 rounded-lg" style={{ background: 'white', color: INK }}>
                                        {t.topic_name}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {inactiveChapters.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer font-medium text-gray-400 select-none">
                                {inactiveChapters.length} inactive chapter{inactiveChapters.length === 1 ? '' : 's'}
                              </summary>
                              <div className="mt-1.5 space-y-0.5">
                                {inactiveChapters.map(ch => (
                                  <div key={ch.school_chapter_id} className="line-through text-gray-400 text-[11px]">{ch.chapter_name}</div>
                                ))}
                              </div>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}

              </>
            )}
          </div>

        </div>
      )}

      {/* ── MODALS ── */}

      {/* Subscribe chooser — only shown when carry-forward candidates exist
          for this year (otherwise Subscribe goes straight to the master-
          template modal, no extra click for the common no-prior-year case).
          "Clone Master Syllabus" is the existing Subscribe-from-template
          flow; "Copy from Previous Year" opens the bulk grade→subjects
          picker below instead of the old one-button-per-subject list. */}
      {showSubscribeChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
            <button data-testid="subscribe-chooser-close" onClick={() => setShowSubscribeChooser(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold mb-1" style={{ color: INK }}>Subscribe to a Subject</h3>
            <p className="text-xs text-gray-500 mb-5">
              {carryForwardCandidates.length} subject{carryForwardCandidates.length === 1 ? '' : 's'} from {priorYearLabel} {carryForwardCandidates.length === 1 ? "hasn't" : "haven't"} carried forward yet — clone fresh from the board template, or copy last year&apos;s content as-is.
            </p>
            <div className="space-y-3">
              <button
                data-testid="subscribe-chooser-clone-master"
                onClick={() => { setShowSubscribeChooser(false); setShowSubscribeModal(true) }}
                className="w-full text-left p-4 rounded-2xl border hover:border-teal-300 transition-colors"
                style={{ borderColor: BORDER }}
              >
                <div className="flex items-center gap-2 font-semibold text-sm mb-1" style={{ color: INK }}>
                  <Sparkles size={15} style={{ color: TEAL }} /> Clone Master Syllabus
                </div>
                <p className="text-xs text-gray-500">Subscribe fresh from the board&apos;s master template — picks up any catalog updates, starts clean.</p>
              </button>
              <button
                data-testid="subscribe-chooser-copy-prior-year"
                onClick={() => { setShowSubscribeChooser(false); openCarryForwardModal() }}
                className="w-full text-left p-4 rounded-2xl border hover:border-teal-300 transition-colors"
                style={{ borderColor: BORDER }}
              >
                <div className="flex items-center gap-2 font-semibold text-sm mb-1" style={{ color: INK }}>
                  <BookOpen size={15} style={{ color: TEAL }} /> Copy from Previous Year
                </div>
                <p className="text-xs text-gray-500">Carry {priorYearLabel}&apos;s content into {selectedYear} as-is — keeps any custom chapters/topics your teachers already added.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk carry-forward modal — step 1: pick a grade; step 2: check
          which of that grade's pending subjects to copy. One submit copies
          all checked subjects sequentially via handleBulkCopyFromPriorYear. */}
      {showCarryForwardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <button data-testid="carry-forward-modal-close" onClick={() => setShowCarryForwardModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold mb-1" style={{ color: INK }}>Copy from {priorYearLabel}</h3>

            {carryForwardStep === 'grade' ? (
              <>
                <p className="text-xs text-gray-500 mb-5">Which grade are you rolling forward?</p>
                <div className="space-y-2">
                  {carryForwardGrades.map(grade => {
                    const count = carryForwardCandidates.filter(c => c.grade === grade).length
                    return (
                      <button
                        key={grade}
                        data-testid={`carry-forward-grade-${grade}`}
                        onClick={() => { setCarryForwardGrade(grade); setCarryForwardSelectedIds(carryForwardCandidates.filter(c => c.grade === grade).map(c => c.id)); setCarryForwardStep('subjects') }}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border hover:border-teal-300 transition-colors text-left"
                        style={{ borderColor: BORDER }}
                      >
                        <span className="font-semibold text-sm" style={{ color: INK }}>Grade {grade}</span>
                        <span className="text-xs text-gray-400">{count} subject{count === 1 ? '' : 's'} pending</span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setCarryForwardStep('grade')}
                  className="text-xs font-semibold mb-3"
                  style={{ color: TEAL }}
                >
                  ← Change grade
                </button>
                <p className="text-xs text-gray-500 mb-3">
                  Grade {carryForwardGrade} — check which subjects to copy from {priorYearLabel} into {selectedYear}.
                </p>
                <div className="space-y-1.5 mb-4">
                  {carryForwardCandidates.filter(c => c.grade === carryForwardGrade).map(candidate => {
                    const checked = carryForwardSelectedIds.includes(candidate.id)
                    return (
                      <label key={candidate.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer" style={{ borderColor: BORDER, background: checked ? '#EDF9F6' : 'white' }}>
                        <input
                          type="checkbox"
                          data-testid={`carry-forward-subject-${candidate.id}`}
                          checked={checked}
                          onChange={e => setCarryForwardSelectedIds(prev => e.target.checked ? [...prev, candidate.id] : prev.filter(id => id !== candidate.id))}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium flex-1" style={{ color: INK }}>{candidate.subject_name}</span>
                        {!candidate.master_subject_id && (
                          <span className="text-[10px] text-gray-400 italic">custom — no master template</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {bulkCopyError && (
                  <div className="px-3 py-2 rounded-lg text-xs mb-3" style={{ background: '#FCEBEB', color: '#791F1F' }}>{bulkCopyError}</div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    data-testid="carry-forward-submit"
                    onClick={handleBulkCopyFromPriorYear}
                    disabled={bulkCopying || carryForwardSelectedIds.length === 0}
                    className="text-sm font-semibold px-4 py-2.5 rounded-xl text-white disabled:opacity-50"
                    style={{ background: TEAL }}
                  >
                    {bulkCopying ? 'Copying…' : `Copy ${carryForwardSelectedIds.length} Subject${carryForwardSelectedIds.length === 1 ? '' : 's'}`}
                  </button>
                  <button
                    onClick={() => setShowCarryForwardModal(false)}
                    className="text-sm px-3 py-2.5 rounded-xl border"
                    style={{ borderColor: BORDER, color: INK }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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

            {/* Subscribing now auto-assigns this subject to every existing
                class of Grade {filterGrade} server-side — no per-section
                picker needed here anymore. */}
            <div className="mb-5 rounded-2xl p-3 text-xs text-gray-500 flex items-center gap-2" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <Check size={13} style={{ color: TEAL }} className="flex-shrink-0" />
              Will be assigned automatically to every Grade {filterGrade} class, with a teacher auto-matched where possible.
            </div>

            <div className="space-y-2 mb-6">
              <label className={labelCls}>
                Select Available Template Subject{selectedMasterIds.length > 0 ? ` (${selectedMasterIds.length} selected)` : ''} *
              </label>

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
                    const isSelected = selectedMasterIds.includes(String(sub.id))
                    const toggleSelection = () => {
                      if (alreadySubscribed) return
                      setSelectedMasterIds(prev =>
                        prev.includes(String(sub.id))
                          ? prev.filter(id => id !== String(sub.id))
                          : [...prev, String(sub.id)]
                      )
                    }

                    return (
                      <label
                        key={sub.id}
                        className="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all"
                        style={{
                          background: alreadySubscribed ? SURFACE : isSelected ? '#E7F3F4' : 'white',
                          borderColor: alreadySubscribed ? BORDER : isSelected ? TEAL : BORDER,
                          color: alreadySubscribed ? '#9ca3af' : isSelected ? TEAL : '#374151',
                          opacity: alreadySubscribed ? 0.6 : 1,
                          cursor: alreadySubscribed ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            data-testid={`subscribe-master-${sub.id}-checkbox`}
                            type="checkbox"
                            value={sub.id}
                            disabled={alreadySubscribed}
                            checked={isSelected}
                            onChange={toggleSelection}
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
                onClick={() => { setShowSubscribeModal(false); setSelectedMasterIds([]) }}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                data-testid="subscribe-modal-submit"
                type="button"
                onClick={handleSubscribe}
                disabled={subscribing || selectedMasterIds.length === 0}
                className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-md"
                style={{ background: TEAL }}
              >
                {subscribing
                  ? 'Cloning Syllabus...'
                  : selectedMasterIds.length > 1
                  ? `Subscribe & Clone (${selectedMasterIds.length})`
                  : 'Subscribe & Clone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Subject Modal — always available, independent of any
          master-catalog subscription. Only creates the subject shell
          (subject_name + grade); chapters/topics are added later by the
          teacher via the Syllabus tab's Add Chapter / bootstrap flows. */}
      {showCustomSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(15,42,63,0.45)' }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 relative shadow-2xl my-8">
            <button
              data-testid="custom-subject-modal-close"
              onClick={() => setShowCustomSubjectModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-lg"
              aria-label="Close add custom subject modal"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-semibold mb-2" style={{ color: INK }}>Add Custom Subject</h3>
            <p className="text-xs text-gray-500 mb-4">
              For a subject Platform Admin&apos;s catalog doesn&apos;t cover (e.g. a locally-taught subject). Only the name and grade are set here — the assigned teacher builds out chapters and topics from the Syllabus tab afterward.
            </p>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Subject Name</label>
                <input
                  data-testid="custom-subject-name-input"
                  value={customSubjectName}
                  onChange={e => setCustomSubjectName(e.target.value)}
                  placeholder="e.g. Value Education"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </div>
              <div>
                <label className={labelCls}>Grade</label>
                <select
                  data-testid="custom-subject-grade-select"
                  value={customSubjectGrade}
                  onChange={e => setCustomSubjectGrade(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <option value="">Select grade…</option>
                  {Array.from(new Set(classes.map(c => c.grade))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)).map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              {customSubjectError && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                  {customSubjectError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-2 border-t" style={{ borderColor: '#EFEDE6' }}>
              <button
                data-testid="custom-subject-modal-cancel"
                type="button"
                onClick={() => setShowCustomSubjectModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                data-testid="custom-subject-modal-submit"
                type="button"
                onClick={handleCreateCustomSubject}
                disabled={creatingCustomSubject || !customSubjectName.trim() || !customSubjectGrade}
                className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-md"
                style={{ background: TEAL }}
              >
                {creatingCustomSubject ? 'Adding…' : 'Add Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
