'use client'

import { useState } from 'react'
import DailyQuiz from '@/components/dailyQuiz/DailyQuiz'
import QuizProgress from '@/components/dailyQuiz/QuizProgress'
import { DoubtHelp, StudentDoubtsPanel } from '@/components/dailyQuiz/Doubts'
import { StudentPageIntro } from './StudentExperience'

/**
 * Student portal → Daily quiz (#433), with points, streak and the class leaderboard (#434) and, when the
 * school has Student Doubts, Ask WLYL AI → Ask Teacher on every reviewed question and "My doubts" (#435).
 */
export default function StudentDailyQuiz({ doubtsEnabled }: { doubtsEnabled: boolean }) {
  // Bumped when a quiz is finished or a doubt raised, so the panels below reload.
  const [finished, setFinished] = useState(0)
  const [doubtsChanged, setDoubtsChanged] = useState(0)
  return (
    <div className="space-y-6">
      <StudentPageIntro
        eyebrow="Every school day"
        title="Daily quiz"
        description="One question from each subject, from what your teachers covered this week. Finish it before the quiz closes; the answers and explanations come out after."
        sticker="brain"
        tone="mint"
      />
      <DailyQuiz
        experience="student"
        query=""
        onFinished={() => setFinished(n => n + 1)}
        renderReviewActions={doubtsEnabled ? (q, attempt) => <DoubtHelp q={q} attempt={attempt} onDoubtRaised={() => setDoubtsChanged(n => n + 1)} /> : undefined}
        footer={
          <>
            {doubtsEnabled && <StudentDoubtsPanel refreshKey={doubtsChanged} onClarified={() => setFinished(n => n + 1)} />}
            <QuizProgress key={finished} experience="student" query="" />
          </>
        }
      />
    </div>
  )
}
