'use client'

import { useState } from 'react'
import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'
import QuizProgress from '@/components/dailyQuiz/QuizProgress'
import { StudentPageIntro } from './StudentExperience'

/** Student portal → Daily quiz (#433), with points, streak and the class leaderboard (#434). */
export default function StudentDailyQuiz() {
  // Bumped when a quiz is finished, so the points panel reloads.
  const [finished, setFinished] = useState(0)
  return (
    <div className="space-y-6">
      <StudentPageIntro
        eyebrow="Every school day"
        title="Daily quiz"
        description="One question from each subject, from what your teachers covered this week. Finish it before the quiz closes; the answers and explanations come out after."
        sticker="brain"
        tone="mint"
      />
      <DailyQuiz experience="student" query="" onFinished={() => setFinished(n => n + 1)}
        footer={<QuizProgress key={finished} experience="student" query="" />} />
    </div>
  )
}
