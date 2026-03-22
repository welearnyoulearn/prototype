'use client'

import React, { useEffect, useState } from 'react'

type Props = { schoolId: number }

type Teacher = { id: number; name: string; subject: string; email: string; phone: string; employee_id: string; department: string }
type Subject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; periods_per_week: number }
type ClassRow = {
  id: number
  grade: string
  section: string
  class_teacher_id: number | null
  class_teacher_name: string | null
  student_count: number
}
type ClassDetail = ClassRow & { subjects: Subject[] }
type Student = {
  id: number; name: string; roll_number: string; email: string; phone: string; parent_name: string; parent_phone: string
}
type AttSummaryItem = {
  total: number; present: number; absent: number; late: number
  marked_by_name: string | null; marked_at: string | null
}
type AttSummary = { morning?: AttSummaryItem; afternoon?: AttSummaryItem }
type MonthlyAttRecord = {
  student_id: number; student_name: string; roll_number: string
  date: string; session: string; status: string
}
type TimetableSlot = {
  id: number
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject_name: string | null
  teacher_id: number | null
  teacher_name: string | null
  is_break: boolean
  break_label: string | null
}
type ClassSubstitute = {
  id: number
  period_number: number
  subject_name: string | null
  original_teacher_name: string | null
  original_teacher_department: string | null
  substitute_teacher_name: string | null
  date: string
}

function getAnchorMonday(): Date {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)
  else monday.setDate(today.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekDatesCM(weekOffset = 0): Record<string, string> {
  const monday = getAnchorMonday()
  monday.setDate(monday.getDate() + weekOffset * 7)
  const result: Record<string, string> = {}
  DAYS.forEach((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    result[day] = d.toISOString().split('T')[0]
  })
  return result
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ClassManagement({ schoolId }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selected class detail
  const [selectedClass, setSelectedClass] = useState<ClassDetail | null>(null)
  const [classStudents, setClassStudents] = useState<Student[]>([])
  const [classTeacherDetail, setClassTeacherDetail] = useState<Teacher | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Add class form
  const [showAddClass, setShowAddClass] = useState(false)
  const [newClass, setNewClass] = useState({ grade: '', section: '', class_teacher_id: '' })
  const [addingClass, setAddingClass] = useState(false)

  // Subjects
  const [newSubject, setNewSubject] = useState({ subject_name: '', teacher_id: '', periods_per_week: '4' })
  const [addingSubject, setAddingSubject] = useState(false)

  // Assign teacher inline
  const [assigningId, setAssigningId] = useState<number | null>(null)
  const [assignTeacherId, setAssignTeacherId] = useState('')

  // Timetable tab
  const [activeTab, setActiveTab] = useState<'overview' | 'timetable' | 'attendance'>('overview')
  // Attendance tab
  const now2 = new Date()
  const [classAttSummary, setClassAttSummary] = useState<AttSummary>({})
  const [classMonthlyAtt, setClassMonthlyAtt] = useState<MonthlyAttRecord[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [attMonth, setAttMonth] = useState(`${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`)
  const [classTimetable, setClassTimetable] = useState<TimetableSlot[]>([])
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState('')
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTeacherId, setEditTeacherId] = useState('')
  const [savingSlot, setSavingSlot] = useState(false)
  const [classSubstitutes, setClassSubstitutes] = useState<ClassSubstitute[]>([])
  const [ttWeekOffset, setTtWeekOffset] = useState(0)

  useEffect(() => { loadData() }, [schoolId])

  async function loadData() {
    setLoading(true)
    try {
      const [cls, tch] = await Promise.all([
        fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
      ])
      setClasses(Array.isArray(cls) ? cls : [])
      setTeachers(Array.isArray(tch) ? tch : [])
    } catch {
      setError('Failed to load class data')
    } finally {
      setLoading(false)
    }
  }

  async function openClassDetail(cls: ClassRow) {
    setDetailLoading(true)
    setSelectedClass({ ...cls, subjects: [] })
    setClassStudents([])
    setClassTeacherDetail(null)
    setClassTimetable([])
    setClassAttSummary({})
    setClassMonthlyAtt([])
    setActiveTab('overview')
    setGenerateMsg('')
    setEditingSlot(null)
    try {
      const [detail, studs] = await Promise.all([
        fetch(`/api/classes/${cls.id}`).then(r => r.json()),
        fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json()),
      ])
      setSelectedClass(detail)
      setClassStudents(Array.isArray(studs) ? studs : [])
      if (cls.class_teacher_id) {
        const t = teachers.find(t => t.id === cls.class_teacher_id) || null
        setClassTeacherDetail(t)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault()
    const grade = newClass.grade.trim()
    const section = newClass.section.trim().toUpperCase()
    if (!grade) { setError('Grade is required'); return }
    if (!section) { setError('Section is required'); return }
    if (!/^[0-9]+$/.test(grade) || parseInt(grade) < 1 || parseInt(grade) > 12) {
      setError('Grade must be a number between 1 and 12')
      return
    }
    if (!/^[A-Z]$/.test(section)) {
      setError('Section must be a single letter (A–Z)')
      return
    }
    setAddingClass(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade, section, class_teacher_id: newClass.class_teacher_id || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewClass({ grade: '', section: '', class_teacher_id: '' })
      setShowAddClass(false)
      loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add class')
    } finally {
      setAddingClass(false)
    }
  }

  async function deleteClass(id: number) {
    if (!confirm('Delete this class and all its subjects?')) return
    try {
      await fetch(`/api/classes/${id}`, { method: 'DELETE' })
      setClasses(prev => prev.filter(c => c.id !== id))
      if (selectedClass?.id === id) setSelectedClass(null)
    } catch { setError('Failed to delete class') }
  }

  async function assignClassTeacher(classId: number) {
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_teacher_id: assignTeacherId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const t = teachers.find(t => t.id === parseInt(assignTeacherId)) || null
      setClasses(prev => prev.map(c => c.id === classId ? { ...c, class_teacher_id: data.class_teacher_id, class_teacher_name: t?.name || null } : c))
      if (selectedClass?.id === classId) {
        setSelectedClass(prev => prev ? { ...prev, class_teacher_id: data.class_teacher_id, class_teacher_name: t?.name || null } : prev)
        setClassTeacherDetail(t)
      }
      setAssigningId(null)
      setAssignTeacherId('')
    } catch { setError('Failed to assign teacher') }
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClass) return
    const subjectName = newSubject.subject_name.trim()
    if (!subjectName) { setError('Subject name is required'); return }
    if (subjectName.length < 2) { setError('Subject name must be at least 2 characters'); return }
    // Prevent duplicate subjects in the same class
    if (selectedClass.subjects.some(s => s.subject_name.toLowerCase() === subjectName.toLowerCase())) {
      setError(`"${subjectName}" is already added to this class`)
      return
    }
    setAddingSubject(true)
    try {
      const res = await fetch(`/api/classes/${selectedClass.id}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subjectName,
          teacher_id: newSubject.teacher_id || null,
          periods_per_week: parseInt(newSubject.periods_per_week) || 4,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSelectedClass(prev => prev ? { ...prev, subjects: [...prev.subjects, data] } : prev)
      setNewSubject({ subject_name: '', teacher_id: '', periods_per_week: '4' })

      // Auto-regenerate timetable for this class after adding subject
      autoGenerateForClass(selectedClass.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add subject')
    } finally {
      setAddingSubject(false)
    }
  }

  async function autoGenerateForClass(classId: number) {
    try {
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: classId, replace_existing: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setGenerateMsg(`✓ Timetable auto-updated for this class (${data.slots} slots)`)
        if (activeTab === 'timetable') loadClassTimetable(classId)
      }
    } catch { /* silent */ }
  }

  async function deleteSubject(subjectId: number) {
    if (!selectedClass) return
    try {
      await fetch(`/api/classes/${selectedClass.id}/subjects?subject_id=${subjectId}`, { method: 'DELETE' })
      setSelectedClass(prev => prev ? { ...prev, subjects: prev.subjects.filter(s => s.id !== subjectId) } : prev)
    } catch { setError('Failed to remove subject') }
  }

  async function loadClassTimetable(classId: number) {
    setTimetableLoading(true)
    try {
      const [ttRes, subRes] = await Promise.all([
        fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}`),
        fetch(`/api/substitutes?school_id=${schoolId}&class_id=${classId}`),
      ])
      const ttData = await ttRes.json()
      const subData = await subRes.json()
      setClassTimetable(Array.isArray(ttData) ? ttData : [])
      setClassSubstitutes(Array.isArray(subData) ? subData : [])
    } catch { setError('Failed to load timetable') }
    finally { setTimetableLoading(false) }
  }

  async function loadClassAttendance(classId: number, month: string) {
    setAttLoading(true)
    const today = new Date().toISOString().split('T')[0]
    try {
      const [summary, monthly] = await Promise.all([
        fetch(`/api/attendance?class_id=${classId}&school_id=${schoolId}&date=${today}&summary=true`).then(r => r.json()),
        fetch(`/api/attendance?class_id=${classId}&school_id=${schoolId}&month=${month}`).then(r => r.json()),
      ])
      setClassAttSummary(summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {})
      setClassMonthlyAtt(Array.isArray(monthly) ? monthly : [])
    } catch { /* ignore */ }
    finally { setAttLoading(false) }
  }

  async function handleGenerate(replaceExisting: boolean) {
    setGenerating(true); setGenerateMsg('')
    try {
      const body: Record<string, unknown> = { school_id: schoolId, replace_existing: replaceExisting }
      // When not replacing all, scope to current class only
      if (!replaceExisting && selectedClass) body.class_id = selectedClass.id
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenerateMsg(`✓ Generated ${data.slots} slots for ${data.classes} class(es)`)
      if (selectedClass) loadClassTimetable(selectedClass.id)
    } catch (err: unknown) {
      setGenerateMsg(err instanceof Error ? err.message : 'Failed to generate')
    } finally { setGenerating(false) }
  }

  async function saveSlotEdit(slotId: number) {
    setSavingSlot(true)
    try {
      const res = await fetch('/api/class-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slotId, subject_name: editSubject || null, teacher_id: editTeacherId ? parseInt(editTeacherId) : null }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setClassTimetable(prev => prev.map(s => s.id === slotId
        ? { ...s, subject_name: editSubject || null, teacher_id: editTeacherId ? parseInt(editTeacherId) : null, teacher_name: teachers.find(t => t.id === parseInt(editTeacherId))?.name || null }
        : s
      ))
      setEditingSlot(null)
    } catch { setError('Failed to update slot') }
    finally { setSavingSlot(false) }
  }

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300'

  if (loading) return <div className="py-12 text-center text-gray-400">Loading classes...</div>

  return (
    <div className="flex gap-6">
      {/* Left: Class list */}
      <div className={selectedClass ? 'w-72 flex-shrink-0' : 'flex-1'}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Class Management</h2>
            <p className="text-sm text-gray-500 mt-0.5">{classes.length} class{classes.length !== 1 ? 'es' : ''} — click to view details</p>
          </div>
          <button onClick={() => setShowAddClass(v => !v)}
            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add Class
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {showAddClass && (
          <form onSubmit={addClass} className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Grade *</label>
                <input required value={newClass.grade} onChange={e => setNewClass(f => ({ ...f, grade: e.target.value }))}
                  className={inputCls + ' w-20'} placeholder="10" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Section *</label>
                <input required value={newClass.section} onChange={e => setNewClass(f => ({ ...f, section: e.target.value }))}
                  className={inputCls + ' w-16'} placeholder="A" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Class Teacher (optional)</label>
              <select value={newClass.class_teacher_id} onChange={e => setNewClass(f => ({ ...f, class_teacher_id: e.target.value }))}
                className={inputCls + ' w-full'}>
                <option value="">— None —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={addingClass}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {addingClass ? 'Adding...' : 'Add Class'}
              </button>
              <button type="button" onClick={() => setShowAddClass(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-white transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {classes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-10 text-center">
              <p className="text-gray-400 text-sm">No classes yet</p>
            </div>
          ) : (
            classes.map(cls => (
              <div key={cls.id}
                onClick={() => openClassDetail(cls)}
                className={`bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md ${selectedClass?.id === cls.id ? 'border-violet-400 ring-2 ring-violet-200' : 'border-gray-200 hover:border-violet-200'}`}>
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-gray-900">Grade {cls.grade} – {cls.section}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {cls.class_teacher_name ? `CT: ${cls.class_teacher_name}` : <span className="text-orange-400">No class teacher</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{cls.student_count} student{Number(cls.student_count) !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteClass(cls.id) }}
                      className="text-red-300 hover:text-red-500 text-xs p-1">✕</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Class detail */}
      {selectedClass && (
        <div className="flex-1 min-w-0">
          {detailLoading ? (
            <div className="py-12 text-center text-gray-400">Loading class details...</div>
          ) : (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Grade {selectedClass.grade} – Section {selectedClass.section}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{classStudents.length} students · {selectedClass.subjects.length} subjects</p>
                </div>
                <button onClick={() => setSelectedClass(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
                <button onClick={() => setActiveTab('overview')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Overview
                </button>
                <button onClick={() => { setActiveTab('timetable'); if (selectedClass) loadClassTimetable(selectedClass.id) }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'timetable' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Timetable
                </button>
                <button onClick={() => { setActiveTab('attendance'); if (selectedClass) loadClassAttendance(selectedClass.id, attMonth) }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'attendance' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Attendance
                </button>
              </div>

              {activeTab === 'overview' && (
                <>
                  {/* Class Teacher card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-700 text-sm">Class Teacher</h4>
                      {assigningId === selectedClass.id ? (
                        <div className="flex items-center gap-2">
                          <select value={assignTeacherId} onChange={e => setAssignTeacherId(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300">
                            <option value="">— None —</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <button onClick={() => assignClassTeacher(selectedClass.id)}
                            className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg transition-colors">Save</button>
                          <button onClick={() => setAssigningId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAssigningId(selectedClass.id); setAssignTeacherId(selectedClass.class_teacher_id?.toString() || '') }}
                          className="text-xs text-violet-600 hover:text-violet-800 underline">
                          {selectedClass.class_teacher_name ? 'Change' : 'Assign'}
                        </button>
                      )}
                    </div>

                    {classTeacherDetail ? (
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                          {classTeacherDetail.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{classTeacherDetail.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{classTeacherDetail.employee_id}</p>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500">
                            {classTeacherDetail.subject && <span>Subject: {classTeacherDetail.subject}</span>}
                            {classTeacherDetail.department && <span>Dept: {classTeacherDetail.department}</span>}
                            {classTeacherDetail.email && <span>{classTeacherDetail.email}</span>}
                            {classTeacherDetail.phone && <span>{classTeacherDetail.phone}</span>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm italic">No class teacher assigned</p>
                    )}
                  </div>

                  {/* Subjects */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                    <h4 className="font-semibold text-gray-700 text-sm mb-3">Subjects ({selectedClass.subjects.length})</h4>
                    {selectedClass.subjects.length === 0 ? (
                      <p className="text-gray-400 text-sm mb-3">No subjects added yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {selectedClass.subjects.map(s => (
                          <div key={s.id} className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                            <span className="text-sm font-medium text-violet-800">{s.subject_name}</span>
                            <span className="text-xs bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-full font-mono">{s.periods_per_week || 4}p/w</span>
                            {s.teacher_name && <span className="text-xs text-violet-500">· {s.teacher_name}</span>}
                            <button onClick={() => deleteSubject(s.id)} className="text-violet-300 hover:text-red-500 text-xs ml-1">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={addSubject} className="flex gap-2 items-end border-t border-gray-100 pt-3 flex-wrap">
                      <div className="flex-1 min-w-32">
                        <label className="block text-xs text-gray-500 mb-1">Subject Name *</label>
                        <input required value={newSubject.subject_name} onChange={e => setNewSubject(f => ({ ...f, subject_name: e.target.value }))}
                          className={inputCls + ' w-full'} placeholder="e.g. Mathematics" />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-gray-500 mb-1">Periods/week</label>
                        <input type="number" min="1" max="12" value={newSubject.periods_per_week}
                          onChange={e => setNewSubject(f => ({ ...f, periods_per_week: e.target.value }))}
                          className={inputCls + ' w-full'} />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs text-gray-500 mb-1">Teacher</label>
                        <select value={newSubject.teacher_id} onChange={e => setNewSubject(f => ({ ...f, teacher_id: e.target.value }))}
                          className={inputCls + ' w-full'}>
                          <option value="">— None —</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <button type="submit" disabled={addingSubject}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
                        {addingSubject ? '...' : '+ Add'}
                      </button>
                    </form>
                  </div>

                  {/* Students in class */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h4 className="font-semibold text-gray-700 text-sm">Students in this class ({classStudents.length})</h4>
                    </div>
                    {classStudents.length === 0 ? (
                      <div className="py-8 text-center text-gray-400 text-sm">No students enrolled in Grade {selectedClass.grade} – {selectedClass.section} yet</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Student ID</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Name</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Parent</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Contact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {classStudents.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-mono text-xs text-gray-400">{s.roll_number || '—'}</td>
                              <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                              <td className="px-5 py-3 text-gray-500 text-xs">{s.parent_name || '—'}</td>
                              <td className="px-5 py-3 text-gray-500 text-xs">{s.parent_phone || s.phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'attendance' && (
                <AttendanceTab
                  schoolId={schoolId}
                  classId={selectedClass.id}
                  grade={selectedClass.grade}
                  section={selectedClass.section}
                  attSummary={classAttSummary}
                  monthlyAtt={classMonthlyAtt}
                  loading={attLoading}
                  attMonth={attMonth}
                  onMonthChange={(m) => { setAttMonth(m); loadClassAttendance(selectedClass.id, m) }}
                />
              )}

              {activeTab === 'timetable' && (
                <TimetableTab
                  classTimetable={classTimetable}
                  timetableLoading={timetableLoading}
                  generating={generating}
                  generateMsg={generateMsg}
                  teachers={teachers}
                  editingSlot={editingSlot}
                  editSubject={editSubject}
                  editTeacherId={editTeacherId}
                  savingSlot={savingSlot}
                  classSubstitutes={classSubstitutes}
                  weekOffset={ttWeekOffset}
                  onWeekOffsetChange={setTtWeekOffset}
                  onGenerate={handleGenerate}
                  onStartEdit={(slot) => { setEditingSlot(slot.id); setEditSubject(slot.subject_name || ''); setEditTeacherId(slot.teacher_id?.toString() || '') }}
                  onCancelEdit={() => setEditingSlot(null)}
                  onSaveEdit={saveSlotEdit}
                  setEditSubject={setEditSubject}
                  setEditTeacherId={setEditTeacherId}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Attendance Tab Sub-component ────────────────────────────────────────────

type AttendanceTabProps = {
  schoolId: number
  classId: number
  grade: string
  section: string
  attSummary: AttSummary
  monthlyAtt: MonthlyAttRecord[]
  loading: boolean
  attMonth: string
  onMonthChange: (m: string) => void
}

function AttendanceTab({ grade, section, attSummary, monthlyAtt, loading, attMonth, onMonthChange }: AttendanceTabProps) {
  const now = new Date()
  const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Monthly grid helpers
  const [monthYear, monthNum] = attMonth.split('-').map(Number)
  const daysInMonth = new Date(monthYear, monthNum, 0).getDate()
  const monthDates = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const students = [...new Map(monthlyAtt.map(r => [
    r.student_id, { id: r.student_id, name: r.student_name, roll: r.roll_number }
  ])).values()].sort((a, b) => (a.roll || '').localeCompare(b.roll || '') || a.name.localeCompare(b.name))

  function getStatus(studentId: number, day: number, sess: string) {
    const dateStr = `${attMonth}-${String(day).padStart(2, '0')}`
    const rec = monthlyAtt.find(r =>
      r.student_id === studentId &&
      r.date?.toString().startsWith(dateStr) &&
      (r.session === sess || (!r.session && sess === 'morning'))
    )
    return rec?.status || null
  }

  function getStudentPct(studentId: number) {
    const recs = monthlyAtt.filter(r => r.student_id === studentId)
    if (recs.length === 0) return null
    const score = recs.reduce((acc, r) => acc + (r.status === 'present' ? 1 : r.status === 'late' ? 0.5 : 0), 0)
    return Math.round((score / recs.length) * 100)
  }

  const StatusDot = ({ status }: { status: string | null }) => {
    if (!status) return <span className="text-gray-200 text-xs">·</span>
    if (status === 'present') return <span className="text-green-600 font-bold text-xs">✓</span>
    if (status === 'absent') return <span className="text-red-500 text-xs">○</span>
    return <span className="text-yellow-500 text-xs">↗</span>
  }

  const fmtMarkedAt = (t: string | null) => t
    ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="space-y-4">
      {/* Today's session summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="font-semibold text-gray-700 text-sm mb-3">
          Today&apos;s Attendance — Class {grade}-{section}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {(['morning', 'afternoon'] as const).map(sess => {
            const info = attSummary[sess]
            const time = fmtMarkedAt(info?.marked_at ?? null)
            return (
              <div key={sess} className={`rounded-xl border px-4 py-3 ${
                info ? (sess === 'morning' ? 'bg-orange-50 border-orange-200' : 'bg-purple-50 border-purple-200')
                     : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{sess === 'morning' ? '🌅' : '🌆'}</span>
                  <p className={`text-xs font-semibold ${sess === 'morning' ? 'text-orange-700' : 'text-purple-700'}`}>
                    {sess === 'morning' ? 'Morning' : 'Afternoon'}
                  </p>
                </div>
                {info ? (
                  <>
                    <div className="flex gap-3 text-sm mb-1">
                      <span className="text-green-700 font-bold">P:{info.present}</span>
                      <span className="text-red-600 font-bold">A:{info.absent}</span>
                      {info.late > 0 && <span className="text-yellow-600 font-bold">L:{info.late}</span>}
                      <span className="text-gray-400">/{info.total}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      Marked by <span className="font-medium text-gray-700">{info.marked_by_name || 'unknown'}</span>
                      {time && ` at ${time}`}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 font-medium">Not marked yet</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly attendance grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h4 className="font-semibold text-gray-700 text-sm">
            Monthly Attendance — {new Date(attMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </h4>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={attMonth}
              max={maxMonth}
              onChange={e => onMonthChange(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="text-green-600 font-bold">✓</span> Present</span>
              <span className="flex items-center gap-1"><span className="text-red-500">○</span> Absent</span>
              <span className="flex items-center gap-1"><span className="text-yellow-500">↗</span> Late</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading attendance data...</div>
        ) : students.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No attendance recorded for this month</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-max w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-600 min-w-[160px] border-r border-gray-200">Student</th>
                  {monthDates.map(d => {
                    const isWeekend = new Date(monthYear, monthNum - 1, d).getDay() === 0 || new Date(monthYear, monthNum - 1, d).getDay() === 6
                    return (
                      <th key={d} className={`px-1 py-2 text-center min-w-[32px] ${isWeekend ? 'text-gray-300' : 'text-gray-600'}`}>
                        <span className="block">{d}</span>
                        <div className="flex justify-center gap-0.5 mt-1">
                          <span className="text-[8px] text-orange-400">M</span>
                          <span className="text-[8px] text-purple-400">A</span>
                        </div>
                      </th>
                    )
                  })}
                  <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[56px] border-l border-gray-200">Att%</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, idx) => {
                  const pct = getStudentPct(student.id)
                  const lowAtt = pct !== null && pct < 75
                  return (
                    <tr key={student.id} className={`border-b border-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/30'} ${lowAtt ? 'bg-red-50/30' : ''}`}>
                      <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 border-r border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-[10px] w-5 flex-shrink-0">{student.roll || idx + 1}</span>
                          <span className="truncate max-w-[110px]">{student.name}</span>
                          {lowAtt && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-semibold flex-shrink-0">Low</span>}
                        </div>
                      </td>
                      {monthDates.map(d => {
                        const isWeekend = new Date(monthYear, monthNum - 1, d).getDay() === 0 || new Date(monthYear, monthNum - 1, d).getDay() === 6
                        return (
                          <td key={d} className={`px-1 py-1.5 text-center ${isWeekend ? 'bg-gray-50' : ''}`}>
                            {isWeekend ? <span className="text-gray-200">—</span> : (
                              <div className="flex flex-col items-center gap-0.5">
                                <StatusDot status={getStatus(student.id, d, 'morning')} />
                                <StatusDot status={getStatus(student.id, d, 'afternoon')} />
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-2 text-center font-bold border-l border-gray-100 ${
                        pct === null ? 'text-gray-300' :
                        pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {pct !== null ? `${pct}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex gap-4">
              <span>M = Morning · A = Afternoon per day</span>
              <span className="text-red-500 font-medium">Low = below 75% attendance</span>
              <span className="ml-auto">% = present sessions / total sessions taken</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timetable Tab Sub-component ─────────────────────────────────────────────

type TimetableTabProps = {
  classTimetable: TimetableSlot[]
  timetableLoading: boolean
  generating: boolean
  generateMsg: string
  teachers: { id: number; name: string; subject: string; email: string; phone: string; employee_id: string; department: string }[]
  editingSlot: number | null
  editSubject: string
  editTeacherId: string
  savingSlot: boolean
  classSubstitutes: ClassSubstitute[]
  weekOffset: number
  onWeekOffsetChange: (offset: number | ((prev: number) => number)) => void
  onGenerate: (replace: boolean) => void
  onStartEdit: (slot: TimetableSlot) => void
  onCancelEdit: () => void
  onSaveEdit: (id: number) => void
  setEditSubject: (v: string) => void
  setEditTeacherId: (v: string) => void
}

function TimetableTab({
  classTimetable, timetableLoading, generating, generateMsg, teachers,
  editingSlot, editSubject, editTeacherId, savingSlot,
  classSubstitutes, weekOffset, onWeekOffsetChange,
  onGenerate, onStartEdit, onCancelEdit, onSaveEdit, setEditSubject, setEditTeacherId
}: TimetableTabProps) {
  const hasSlots = classTimetable.length > 0
  const weekDates = getWeekDatesCM(weekOffset)
  const subsThisWeek = classSubstitutes.filter(s => s.date >= weekDates['Monday'] && s.date <= weekDates['Saturday'])

  // Standard period structure — break shown client-side only (not stored in DB)
  const ALL_PERIODS = [1, 2, 3, 4, 5, 6]
  const BREAK_AFTER: Record<number, { label: string; time: string }> = {
    3: { label: 'Break', time: '10:25 – 10:45' },
  }

  // Get all unique period_numbers from DB (only real periods, no is_break rows)
  const allPeriods = [...new Set(
    classTimetable.filter(s => !s.is_break).map(s => s.period_number)
  )].sort((a, b) => a - b)

  // Use standard 7-period structure if timetable exists, else use what's in DB
  const displayPeriods = hasSlots ? ALL_PERIODS : allPeriods

  // Get representative time for a period
  function getPeriodTime(periodNum: number) {
    const slot = classTimetable.find(s => s.period_number === periodNum && !s.is_break)
    return slot ? `${slot.time_from}–${slot.time_to}` : ''
  }

  // Get slot for a specific day + period
  function getSlot(day: string, periodNum: number) {
    return classTimetable.find(s => s.day_of_week === day && s.period_number === periodNum && !s.is_break)
  }

  const regularCount = classTimetable.filter(s => !s.is_break && s.subject_name).length / DAYS.length
  const freeCount = classTimetable.filter(s => !s.is_break && !s.subject_name).length / DAYS.length

  return (
    <div>
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Class Timetable</p>
            <p className="text-xs text-gray-400 mt-0.5">Auto-generates timetable for all classes in the school without teacher conflicts</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {subsThisWeek.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-medium">
                {subsThisWeek.length} sub{subsThisWeek.length > 1 ? 's' : ''} this week
              </span>
            )}
            <div className="flex items-center gap-1">
              <button onClick={() => onWeekOffsetChange(w => w - 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">← Prev</button>
              <button onClick={() => onWeekOffsetChange(0)} className={`px-2 py-1 text-xs border rounded-lg ${weekOffset === 0 ? 'border-orange-300 bg-orange-50 text-orange-700 font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>This Week</button>
              <button onClick={() => onWeekOffsetChange(w => w + 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Next →</button>
            </div>
            {hasSlots && (
              <button onClick={() => { if (confirm('This will regenerate timetables for ALL classes, replacing existing ones. Continue?')) onGenerate(true) }}
                disabled={generating}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                {generating ? 'Generating...' : 'Regenerate All'}
              </button>
            )}
            <button onClick={() => onGenerate(!hasSlots)}
              disabled={generating}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {generating ? 'Generating...' : hasSlots ? 'Add Missing Slots' : 'Auto-Generate Timetable'}
            </button>
          </div>
        </div>
        {generateMsg && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${generateMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {generateMsg}
          </div>
        )}
      </div>

      {timetableLoading ? (
        <div className="py-12 text-center text-gray-400">Loading timetable...</div>
      ) : !hasSlots ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-400 text-sm">No timetable generated yet</p>
          <p className="text-xs text-gray-300 mt-1">Click "Auto-Generate Timetable" above to create one</p>
        </div>
      ) : (
        <>
          {/* Timetable Grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-3 py-3 text-left font-semibold w-28">Period / Time</th>
                    {DAYS.map(d => (
                      <th key={d} className="px-3 py-3 text-center font-semibold">{d.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayPeriods.map(pNum => {
                    const breakRow = BREAK_AFTER[pNum]
                    return (
                      <React.Fragment key={pNum}>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-3 py-2 bg-gray-50 border-r border-gray-100 font-semibold text-gray-700">
                            <span className="block">Period {pNum}</span>
                            <span className="text-gray-400 font-normal">{getPeriodTime(pNum)}</span>
                          </td>
                          {DAYS.map(day => {
                            const slot = getSlot(day, pNum)
                            const cellDate = weekDates[day]
                            const substitute = cellDate ? classSubstitutes.find(s => s.date.slice(0, 10) === cellDate && s.period_number === pNum) : undefined
                            const hasSubstitute = !!substitute
                            const hasSubject = !!(slot?.subject_name)

                            if (!slot) return (
                              <td key={day} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top ${hasSubstitute ? 'bg-amber-50/30' : ''}`}>
                                {hasSubstitute ? (
                                  <div className="rounded-lg px-2 py-2 min-h-[52px] border-2 border-amber-300 bg-amber-50">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <p className="font-semibold text-gray-800 leading-tight text-xs">{substitute.subject_name || substitute.original_teacher_department || '—'}</p>
                                      <span className="text-[9px] font-bold bg-amber-400 text-white px-1 py-0.5 rounded uppercase">SUB</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 line-through mt-0.5">{substitute.original_teacher_name}</p>
                                    <p className="text-[10px] text-amber-700 font-medium">{substitute.substitute_teacher_name}</p>
                                  </div>
                                ) : (
                                  <div className="px-2 py-2 text-center text-gray-300 text-xs min-h-[52px] flex items-center justify-center">Free</div>
                                )}
                              </td>
                            )

                            const isEditing = editingSlot === slot.id

                            return (
                              <td key={day} className={`px-1 py-1 align-top ${hasSubstitute ? 'bg-amber-50/20' : ''}`}>
                                {isEditing ? (
                                  <div className="bg-violet-50 border border-violet-300 rounded-lg p-2 min-w-28">
                                    <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 bg-white mb-1 focus:outline-none focus:ring-1 focus:ring-violet-300"
                                      placeholder="Subject" />
                                    <select value={editTeacherId} onChange={e => setEditTeacherId(e.target.value)}
                                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 bg-white mb-2 focus:outline-none">
                                      <option value="">No teacher</option>
                                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <div className="flex gap-1">
                                      <button onClick={() => onSaveEdit(slot.id)} disabled={savingSlot}
                                        className="flex-1 bg-violet-600 text-white rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50">
                                        {savingSlot ? '...' : 'Save'}
                                      </button>
                                      <button onClick={onCancelEdit}
                                        className="flex-1 border border-gray-200 text-gray-500 rounded px-2 py-0.5 text-xs">
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => onStartEdit(slot)}
                                    className={`w-full text-left rounded-lg px-2 py-2 transition-all hover:ring-2 hover:ring-violet-300 min-h-[52px] ${
                                      hasSubstitute
                                        ? 'border-2 border-amber-300 bg-amber-50'
                                        : hasSubject
                                          ? slot.teacher_id
                                            ? 'bg-emerald-50 border border-emerald-200'
                                            : 'bg-blue-50 border border-blue-200'
                                          : 'bg-gray-50 border border-gray-200'
                                    }`}>
                                    {(hasSubject || hasSubstitute) ? (
                                      <>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <p className="font-semibold text-gray-800 leading-tight text-xs">
                                            {slot.subject_name || substitute?.subject_name || substitute?.original_teacher_department || '—'}
                                          </p>
                                          {hasSubstitute && <span className="text-[9px] font-bold bg-amber-400 text-white px-1 py-0.5 rounded uppercase">SUB</span>}
                                        </div>
                                        {hasSubstitute ? (
                                          <>
                                            <p className="text-gray-400 line-through text-xs mt-0.5">{slot.teacher_name || substitute?.original_teacher_name}</p>
                                            <p className="text-amber-700 font-medium text-xs">{substitute?.substitute_teacher_name}</p>
                                          </>
                                        ) : (
                                          slot.teacher_name && <p className="text-gray-500 mt-0.5 text-xs">{slot.teacher_name}</p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-gray-300 text-xs italic">Free period</p>
                                    )}
                                  </button>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                        {breakRow && (
                          <tr className="bg-amber-50 border-y border-amber-200">
                            <td className="px-3 py-1.5 text-amber-700 font-semibold text-xs">
                              {breakRow.label}
                              <span className="block text-amber-400 font-normal">{breakRow.time}</span>
                            </td>
                            <td colSpan={6} className="px-3 py-1.5 text-center text-amber-500 italic text-xs font-medium">
                              {breakRow.label}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{displayPeriods.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Periods/Day</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{Math.round(regularCount)}</p>
              <p className="text-xs text-emerald-500 mt-0.5">Subjects Assigned</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-500">{Math.round(freeCount)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Free Periods/Day</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
