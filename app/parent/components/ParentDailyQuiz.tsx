'use client'

import { useState } from 'react'
import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'
import QuizProgress from '@/components/dailyQuiz/QuizProgress'

/**
 * Parent portal → Daily Quiz (#433) for the selected child: today's quiz (a parent can hand the phone to the
 * child to take it), missed quizzes, each finished quiz's answers once they are out, and the child's points,
 * streak and class rank (#434).
 */
export default function ParentDailyQuiz({ studentId, studentName }: { studentId: number; studentName: string }) {
  const [finished, setFinished] = useState(0)
  const query = `?student_id=${studentId}`
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {studentName.split(' ')[0]} gets one question from each subject every school day, from what the teachers covered this week.
          The answers and explanations come out after the quiz closes.
        </p>
      </div>
      {/* key: switching children starts fresh instead of showing the previous child's screen */}
      <DailyQuiz key={studentId} experience="parent" query={query} onFinished={() => setFinished(n => n + 1)}
        footer={<QuizProgress key={`${studentId}-${finished}`} experience="parent" query={query} />} />
    </div>
  )
}
