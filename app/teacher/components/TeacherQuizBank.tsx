'use client'

import { useCallback, useEffect, useState } from 'react'

// Teacher → Quiz Questions (#432): read-only view of the Daily Quiz questions for the subjects this teacher
// teaches, with answers and explanations — so teachers know what their students are asked. In the pilot the
// shared bank is edited by Platform Admin only; students can report a question from the quiz itself.

type Subject = { master_subject_id: number; subject_name: string; grade: string }
type Row = {
  chapter_id: number; chapter_name: string; topic_id: number; topic_name: string
  id: number; stem: string; options: string[]; correct_index: number; explanation: string | null; difficulty: string
}
const LETTERS = ['A', 'B', 'C', 'D']

export default function TeacherQuizBank() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/teacher/quiz-bank')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as { subjects: Subject[] } })
      .then(d => { setSubjects(d.subjects); if (d.subjects.length) setSubjectId(d.subjects[0].master_subject_id) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load subjects'))
  }, [])

  const load = useCallback(async (id: number) => {
    setRows(null); setError('')
    try {
      const r = await fetch(`/api/teacher/quiz-bank?subject_id=${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setRows(d.questions)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load questions') }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (subjectId) void load(subjectId) }, [subjectId, load])

  const q = query.trim().toLowerCase()
  const shown = (rows ?? []).filter(r => !q || r.stem.toLowerCase().includes(q) || r.topic_name.toLowerCase().includes(q) || r.chapter_name.toLowerCase().includes(q))
  const groups: { key: string; chapter: string; topic: string; items: Row[] }[] = []
  for (const r of shown) {
    const key = `${r.chapter_id}-${r.topic_id}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(r)
    else groups.push({ key, chapter: r.chapter_name, topic: r.topic_name, items: [r] })
  }

  return (
    <div className="space-y-4" data-testid="teacher-quiz-bank">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Quiz Questions</h2>
        <p className="text-sm text-gray-500 mt-1">The Daily Quiz questions for the subjects you teach, with answers. Students get them on topics your class has covered.</p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      {subjects === null ? <p className="text-sm text-gray-500">Loading…</p>
        : subjects.length === 0 ? <p className="text-sm text-gray-500" data-testid="teacher-quiz-bank-empty">No quiz questions are published yet for the subjects you teach.</p>
        : (
          <>
            <div className="flex flex-wrap gap-3">
              <select data-testid="teacher-quiz-bank-subject" value={subjectId ?? ''} onChange={e => setSubjectId(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {subjects.map(s => <option key={s.master_subject_id} value={s.master_subject_id}>Grade {s.grade} · {s.subject_name}</option>)}
              </select>
              <input data-testid="teacher-quiz-bank-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search questions or topics"
                className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            {rows === null ? <p className="text-sm text-gray-500">Loading questions…</p>
              : groups.length === 0 ? <p className="text-sm text-gray-500">No questions match.</p>
              : groups.map(g => (
                <section key={g.key} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-500">{g.chapter}</p>
                  <h3 className="text-sm font-semibold text-gray-900">{g.topic} <span className="text-xs font-normal text-gray-500">· {g.items.length} question(s)</span></h3>
                  <ol className="mt-2 space-y-3">
                    {g.items.map(r => (
                      <li key={r.id} data-testid={`teacher-quiz-question-${r.id}`}>
                        <p className="text-sm text-gray-900">{r.stem}</p>
                        <ul className="mt-1 grid sm:grid-cols-2 gap-x-4 text-sm">
                          {r.options.map((o, i) => <li key={i} className={i === r.correct_index ? 'text-green-700 font-semibold' : 'text-gray-700'}>{LETTERS[i]}. {o}{i === r.correct_index ? ' ✓' : ''}</li>)}
                        </ul>
                        {r.explanation && <p className="mt-1 text-xs text-gray-600">💡 {r.explanation}</p>}
                        <p className="text-[11px] text-gray-400 capitalize">{r.difficulty}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
          </>
        )}
    </div>
  )
}
