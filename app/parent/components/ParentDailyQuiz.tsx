'use client'

import { useState } from 'react'
import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'
import QuizProgress from '@/components/dailyQuiz/QuizProgress'
import { ParentDoubtsPanel } from '@/components/dailyQuiz/Doubts'

/**
 * Parent portal → Daily Quiz (#433) for the selected child: today's quiz (a parent can hand the phone to the
 * child to take it), missed quizzes, each finished quiz's answers once they are out, the child's points,
 * streak and class rank (#434), and their doubts' timeline when the school has Student Doubts (#435).
 */
export default function ParentDailyQuiz({ studentId, studentName, doubtsEnabled }: { studentId: number; studentName: string; doubtsEnabled: boolean }) {
  const [finished, setFinished] = useState(0)
  const query = `?student_id=${studentId}`
  const first = studentName.split(' ')[0]
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {first} gets one question from each subject every school day, from what the teachers covered this week.
          The answers and explanations come out after the quiz closes.
        </p>
      </div>
      {/* key: switching children starts fresh instead of showing the previous child's screen */}
      <DailyQuiz key={studentId} experience="parent" query={query} onFinished={() => setFinished(n => n + 1)}
        footer={
          <>
            <QuizProgress key={`${studentId}-${finished}`} experience="parent" query={query} />
            {doubtsEnabled && <ParentDoubtsPanel key={studentId} studentId={studentId} childName={first} />}
          </>
        } />
    </div>
  )
}
