'use client'

import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'

/**
 * Parent portal → Daily Quiz (#433) for the selected child: today's quiz (a parent can hand the phone to the
 * child to take it), missed quizzes, and each finished quiz's answers once they are out.
 */
export default function ParentDailyQuiz({ studentId, studentName }: { studentId: number; studentName: string }) {
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
      <DailyQuiz key={studentId} experience="parent" query={`?student_id=${studentId}`} />
    </div>
  )
}
