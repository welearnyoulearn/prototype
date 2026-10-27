'use client'

import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'
import { StudentPageIntro } from './StudentExperience'

/** Student portal → Daily quiz (#433). */
export default function StudentDailyQuiz() {
  return (
    <div className="space-y-6">
      <StudentPageIntro
        eyebrow="Every school day"
        title="Daily quiz"
        description="One question from each subject, from what your teachers covered this week. Finish it before the quiz closes; the answers and explanations come out after."
        sticker="brain"
        tone="mint"
      />
      <DailyQuiz experience="student" query="" />
    </div>
  )
}
