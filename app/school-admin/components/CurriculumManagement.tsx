'use client'

import { useEffect, useState } from 'react'
import { CURRICULA, CURRICULUM_NAMES, getSubjectsForGrade } from '@/lib/curricula'

type Props = { schoolId: number }
type Assignment = { id: number; grade: string; curriculum_type: string }
type SubjectRow = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null }
type ClassSubjectRow = { id: number; section: string; subjects: SubjectRow[] }
type TeacherOpt = { id: number; name: string; subject: string }

const GRADES = ['1','2','3','4','5','6','7','8','9','10','11','12']
const CURRICULUM_TYPES = Object.keys(CURRICULUM_NAMES)

export default function CurriculumManagement({ schoolId }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedCurriculum, setSelectedCurriculum] = useState('')
  const [preview, setPreview] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // Extra subjects panel (shown after curriculum assign or via "Manage" button)
  const [teachers, setTeachers] = useState<TeacherOpt[]>([])
  const [extraPanel, setExtraPanel] = useState<{ grade: string; classes: ClassSubjectRow[] } | null>(null)
  const [addingExtraFor, setAddingExtraFor] = useState<number | null>(null)
  const [extraForm, setExtraForm] = useState({ subject_name: '', teacher_id: '' })
  const [addingExtra, setAddingExtra] = useState(false)
  const [generatingTT, setGeneratingTT] = useState(false)
  const [ttMsg, setTtMsg] = useState('')

  const [schedSettings, setSchedSettings] = useState<{
    periods_per_day: number; start_time: string; end_time: string;
    morning_break_after_period: number; morning_break_duration: number;
    lunch_after_period: number; lunch_duration: number;
    afternoon_break_after_period: number; afternoon_break_duration: number;
  } | null>(null)
  const [schedOpen, setSchedOpen] = useState(false)
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedForm, setSchedForm] = useState({
    periods_per_day: 8, start_time: '08:30', end_time: '17:00',
    morning_break_after_period: 3, morning_break_duration: 15,
    lunch_after_period: 5, lunch_duration: 45,
    afternoon_break_after_period: 7, afternoon_break_duration: 10,
  })

  useEffect(() => { loadAssignments() }, [schoolId])

  useEffect(() => {
    fetch(`/api/school-schedule?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        setSchedSettings(data)
        setSchedForm({
          periods_per_day: data.periods_per_day ?? 8,
          start_time: data.start_time ?? '08:30',
          end_time: data.end_time ?? '17:00',
          morning_break_after_period: data.morning_break_after_period ?? 3,
          morning_break_duration: data.morning_break_duration ?? 15,
          lunch_after_period: data.lunch_after_period ?? 5,
          lunch_duration: data.lunch_duration ?? 45,
          afternoon_break_after_period: data.afternoon_break_after_period ?? 7,
          afternoon_break_duration: data.afternoon_break_duration ?? 10,
        })
      })
      .catch(() => {})
  }, [schoolId])

  async function saveSchedSettings() {
    setSchedSaving(true)
    try {
      const res = await fetch('/api/school-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, ...schedForm }),
      })
      const data = await res.json()
      if (res.ok) {
        setSchedSettings(data)
        setSchedOpen(false)
        setSuccess('✓ School schedule saved')
      } else {
        setError(data.error || 'Failed to save schedule')
      }
    } finally { setSchedSaving(false) }
  }

  async function loadAssignments() {
    setLoading(true)
    try {
      const res = await fetch(`/api/curriculum?school_id=${schoolId}`)
      const data = await res.json()
      setAssignments(Array.isArray(data) ? data : [])
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  async function loadPanelData(grade: string) {
    try {
      const [classRes, teacherRes] = await Promise.all([
        fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
      ])
      const gradeClasses = (Array.isArray(classRes) ? classRes : []).filter(
        (c: { grade: string }) => c.grade === grade
      )
      setTeachers(Array.isArray(teacherRes) ? teacherRes : [])

      const classesWithSubjects = await Promise.all(
        gradeClasses.map(async (cls: { id: number; section: string }) => {
          const detailRes = await fetch(`/api/classes/${cls.id}`)
          const detail = await detailRes.json()
          return { id: cls.id, section: cls.section, subjects: detail.subjects || [] }
        })
      )
      setExtraPanel({ grade, classes: classesWithSubjects })
    } catch { /* silent */ }
  }

  async function handleAssign(autoAssign: boolean) {
    if (!selectedGrade || !selectedCurriculum) return
    setAssigning(true); setError(''); setSuccess(''); setTtMsg('')
    try {
      const res = await fetch('/api/curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade: selectedGrade, curriculum_type: selectedCurriculum, auto_assign_subjects: autoAssign }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(autoAssign
        ? `✓ ${selectedCurriculum} assigned to Grade ${selectedGrade} — ${data.subjects_added} subjects added. Go to Timetable tab to generate the timetable.`
        : `✓ Curriculum saved for Grade ${selectedGrade}`)
      setPreview(false)
      loadAssignments()

      if (autoAssign) {
        // Load panel to let admin add/review subjects before generating timetable
        await loadPanelData(selectedGrade)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally { setAssigning(false) }
  }

  async function handleManageGrade(a: Assignment) {
    setExtraPanel(null)
    setTtMsg('')
    await loadPanelData(a.grade)
  }

  async function handleRemove(grade: string) {
    if (!confirm(`Remove curriculum for Grade ${grade}? This will also delete the class timetable for all Grade ${grade} classes.`)) return
    try {
      const res = await fetch(`/api/curriculum?school_id=${schoolId}&grade=${grade}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAssignments(prev => prev.filter(a => a.grade !== grade))
      if (extraPanel?.grade === grade) setExtraPanel(null)
      setSuccess(`Curriculum removed for Grade ${grade}. ${data.classes_cleared} class timetable(s) cleared.`)
      setTtMsg('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove curriculum')
    }
  }

  async function addExtraSubject(classId: number) {
    if (!extraForm.subject_name.trim()) return
    setAddingExtra(true)
    try {
      const res = await fetch(`/api/classes/${classId}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_name: extraForm.subject_name, teacher_id: extraForm.teacher_id || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const teacher = teachers.find(t => t.id === parseInt(extraForm.teacher_id))
      const newSubject = { ...data, teacher_name: teacher?.name || data.teacher_name || null }
      setExtraPanel(prev => prev ? {
        ...prev,
        classes: prev.classes.map(c => c.id === classId ? { ...c, subjects: [...c.subjects, newSubject] } : c)
      } : prev)
      setExtraForm({ subject_name: '', teacher_id: '' })
      setAddingExtraFor(null)

      // No auto-regeneration — admin generates timetable intentionally from Timetable tab
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add subject')
    } finally { setAddingExtra(false) }
  }

  async function removeExtraSubject(classId: number, subjectId: number) {
    try {
      await fetch(`/api/classes/${classId}/subjects?subject_id=${subjectId}`, { method: 'DELETE' })
      setExtraPanel(prev => prev ? {
        ...prev,
        classes: prev.classes.map(c => c.id === classId ? { ...c, subjects: c.subjects.filter(s => s.id !== subjectId) } : c)
      } : prev)
    } catch { setError('Failed to remove subject') }
  }

  const previewSubjects = selectedGrade && selectedCurriculum
    ? getSubjectsForGrade(selectedCurriculum, selectedGrade)
    : []

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300'

  return (
    <div>
      {/* School Schedule Settings */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => setSchedOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left">
          <div>
            <p className="font-semibold text-gray-800">School Schedule Settings</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {schedSettings
                ? `${schedSettings.periods_per_day} periods · ${schedSettings.start_time} – ${schedSettings.end_time}`
                : 'Configure school timing before generating timetable'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!schedSettings && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Setup required</span>}
            <span className="text-gray-400">{schedOpen ? '▲' : '▼'}</span>
          </div>
        </button>
        {schedOpen && (
          <div className="border-t border-gray-100 px-5 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                <input type="time" value={schedForm.start_time}
                  onChange={e => setSchedForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
                <input type="time" value={schedForm.end_time}
                  onChange={e => setSchedForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Periods per Day</label>
                <input type="number" min={4} max={12} value={schedForm.periods_per_day}
                  onChange={e => setSchedForm(f => ({ ...f, periods_per_day: parseInt(e.target.value) || 8 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Morning Break After Period</label>
                <input type="number" min={1} max={schedForm.periods_per_day - 2} value={schedForm.morning_break_after_period}
                  onChange={e => setSchedForm(f => ({ ...f, morning_break_after_period: parseInt(e.target.value) || 3 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Morning Break (minutes)</label>
                <input type="number" min={5} max={30} value={schedForm.morning_break_duration}
                  onChange={e => setSchedForm(f => ({ ...f, morning_break_duration: parseInt(e.target.value) || 15 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Lunch After Period</label>
                <input type="number" min={2} max={schedForm.periods_per_day - 1} value={schedForm.lunch_after_period}
                  onChange={e => setSchedForm(f => ({ ...f, lunch_after_period: parseInt(e.target.value) || 5 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Lunch Duration (minutes)</label>
                <input type="number" min={20} max={90} value={schedForm.lunch_duration}
                  onChange={e => setSchedForm(f => ({ ...f, lunch_duration: parseInt(e.target.value) || 45 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Afternoon Break After Period</label>
                <input type="number" min={schedForm.lunch_after_period + 1} max={schedForm.periods_per_day - 1} value={schedForm.afternoon_break_after_period}
                  onChange={e => setSchedForm(f => ({ ...f, afternoon_break_after_period: parseInt(e.target.value) || 7 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Afternoon Break (minutes)</label>
                <input type="number" min={5} max={30} value={schedForm.afternoon_break_duration}
                  onChange={e => setSchedForm(f => ({ ...f, afternoon_break_duration: parseInt(e.target.value) || 10 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Period duration: ~{Math.floor(((schedForm.end_time ? parseInt(schedForm.end_time.split(':')[0])*60+parseInt(schedForm.end_time.split(':')[1]) : 1020) - (schedForm.start_time ? parseInt(schedForm.start_time.split(':')[0])*60+parseInt(schedForm.start_time.split(':')[1]) : 510) - schedForm.morning_break_duration - schedForm.lunch_duration - schedForm.afternoon_break_duration) / schedForm.periods_per_day)} min/period
              </p>
              <button onClick={saveSchedSettings} disabled={schedSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {schedSaving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Curriculum Selection</h2>
          <p className="text-sm text-gray-500 mt-0.5">Select CBSE or APSSC curriculum per grade — auto-assigns subjects to classes</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{success}</div>
      )}
      {ttMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${ttMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {generatingTT ? 'Generating timetable...' : ttMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: assign form */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
            <h3 className="font-semibold text-gray-800 mb-4">Assign Curriculum</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                <select value={selectedGrade} onChange={e => { setSelectedGrade(e.target.value); setPreview(false) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select grade...</option>
                  {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Curriculum</label>
                {CURRICULUM_TYPES.map(ct => (
                  <label key={ct} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer mb-2 transition-colors ${selectedCurriculum === ct ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="curriculum" value={ct} checked={selectedCurriculum === ct}
                      onChange={() => { setSelectedCurriculum(ct); setPreview(false) }} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{ct}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{CURRICULUM_NAMES[ct]}</p>
                    </div>
                  </label>
                ))}
              </div>

              {selectedGrade && selectedCurriculum && (
                <div className="space-y-2">
                  <button onClick={() => setPreview(v => !v)}
                    className="w-full border border-blue-200 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-50">
                    {preview ? 'Hide' : 'Preview Subjects'}
                  </button>
                  <button onClick={() => handleAssign(false)} disabled={assigning}
                    className="w-full border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    Save Only (no auto-assign)
                  </button>
                  <button onClick={() => handleAssign(true)} disabled={assigning}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {assigning ? 'Assigning...' : 'Assign & Add Subjects to Classes'}
                  </button>
                  <p className="text-xs text-gray-400 text-center">Auto-assigns subjects + generates timetable</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: preview + extra subjects panel + existing */}
        <div className="col-span-2 space-y-6">
          {/* Subject preview */}
          {preview && previewSubjects.length > 0 && (
            <div className="bg-white rounded-xl border border-blue-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="font-semibold text-gray-800">Preview: Grade {selectedGrade} – {selectedCurriculum}</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{previewSubjects.length} subjects</span>
              </div>
              <div className="space-y-4">
                {previewSubjects.map(subj => (
                  <div key={subj.name} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <h4 className="font-semibold text-gray-900 text-sm">{subj.name}</h4>
                      <span className="text-xs text-gray-400">({subj.topics.length} topics)</span>
                    </div>
                    <div className="flex flex-wrap gap-1 ml-4">
                      {subj.topics.map(t => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && previewSubjects.length === 0 && selectedGrade && selectedCurriculum && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
              No predefined subjects for Grade {selectedGrade} in {selectedCurriculum}. You can still save the assignment and add subjects manually in Class Management.
            </div>
          )}

          {/* Extra subjects panel */}
          {extraPanel && (
            <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-violet-100 flex items-center justify-between bg-violet-50">
                <div>
                  <h3 className="font-semibold text-gray-800">Grade {extraPanel.grade} — Class Subjects</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Add extra subjects per class beyond the curriculum. Timetable auto-updates.</p>
                </div>
                <button onClick={() => setExtraPanel(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              {extraPanel.classes.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No classes found for Grade {extraPanel.grade}. Add classes in Class Management first.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {extraPanel.classes.map(cls => (
                    <div key={cls.id} className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-gray-800 text-sm">Section {cls.section}</p>
                        <button
                          onClick={() => { setAddingExtraFor(addingExtraFor === cls.id ? null : cls.id); setExtraForm({ subject_name: '', teacher_id: '' }) }}
                          className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg transition-colors">
                          + Add Subject
                        </button>
                      </div>

                      {/* Subjects list */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {cls.subjects.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">No subjects assigned</span>
                        ) : (
                          cls.subjects.map(s => (
                            <div key={s.id} className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                              <span className="text-xs font-medium text-violet-800">{s.subject_name}</span>
                              {s.teacher_name && <span className="text-xs text-violet-500">· {s.teacher_name}</span>}
                              <button onClick={() => removeExtraSubject(cls.id, s.id)} className="text-violet-300 hover:text-red-500 text-xs ml-0.5">×</button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add subject inline form */}
                      {addingExtraFor === cls.id && (
                        <div className="mt-3 bg-violet-50 border border-violet-200 rounded-lg p-3 flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">Subject Name *</label>
                            <input
                              value={extraForm.subject_name}
                              onChange={e => setExtraForm(f => ({ ...f, subject_name: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraSubject(cls.id) } }}
                              className={inputCls + ' w-full'}
                              placeholder="e.g. Computer Science"
                              autoFocus
                            />
                          </div>
                          <div className="w-40">
                            <label className="block text-xs text-gray-500 mb-1">Teacher</label>
                            <select value={extraForm.teacher_id} onChange={e => setExtraForm(f => ({ ...f, teacher_id: e.target.value }))}
                              className={inputCls + ' w-full'}>
                              <option value="">— None —</option>
                              {teachers.map(t => (
                                <option key={t.id} value={t.id}>{t.name}{t.subject ? ` (${t.subject})` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <button onClick={() => addExtraSubject(cls.id)} disabled={addingExtra || !extraForm.subject_name.trim()}
                            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
                            {addingExtra ? '...' : 'Add'}
                          </button>
                          <button onClick={() => setAddingExtraFor(null)}
                            className="border border-gray-200 text-gray-500 hover:bg-white px-3 py-2 rounded-lg text-sm transition-colors">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Existing assignments */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Current Assignments</h3>
              {assignments.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm('Regenerate timetables for ALL grades? This will replace all existing timetables.')) return
                    setGeneratingTT(true); setTtMsg('')
                    try {
                      const res = await fetch('/api/class-timetable/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ school_id: schoolId, force_replace: true }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        setTtMsg(`✓ Regenerated: ${data.slots} slots for ${data.classes_generated} class(es) — synced to all teachers & students`)
                      } else {
                        setTtMsg(`Error: ${data.error}`)
                      }
                    } catch { setTtMsg('Generation failed') }
                    finally { setGeneratingTT(false) }
                  }}
                  disabled={generatingTT}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {generatingTT ? 'Generating...' : 'Regenerate All Timetables'}
                </button>
              )}
            </div>
            {loading ? (
              <div className="py-8 text-center text-gray-400">Loading...</div>
            ) : assignments.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                <p>No curriculum assigned yet</p>
                <p className="text-xs text-gray-300 mt-1">Select a grade and curriculum on the left to get started</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Grade</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Curriculum</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Subjects</th>
                    <th className="px-5 py-3 w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignments.map(a => {
                    const subjects = getSubjectsForGrade(a.curriculum_type, a.grade)
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <span className="font-semibold text-gray-900">Grade {a.grade}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.curriculum_type === 'CBSE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>{a.curriculum_type}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {subjects.slice(0, 5).map(s => (
                              <span key={s.name} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.name}</span>
                            ))}
                            {subjects.length > 5 && (
                              <span className="text-xs text-gray-400">+{subjects.length - 5} more</span>
                            )}
                            {subjects.length === 0 && <span className="text-xs text-gray-400">Custom assignment</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => handleManageGrade(a)}
                              className="text-xs text-violet-600 hover:text-violet-800 font-medium">Manage</button>
                            <button onClick={() => handleRemove(a.grade)}
                              className="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Quick reference */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">All Available Curricula</h3>
            <div className="grid grid-cols-2 gap-4">
              {CURRICULUM_TYPES.map(ct => (
                <div key={ct}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{ct}</p>
                  <div className="flex flex-wrap gap-1">
                    {CURRICULA[ct].map(g => (
                      <span key={g.grade} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                        Gr.{g.grade} ({g.subjects.length} subj)
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
