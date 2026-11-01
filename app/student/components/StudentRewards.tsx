'use client'

import RewardsShop from '@/app/components/rewards/RewardsShop'
import { StudentPageIntro } from './StudentExperience'
import { Sticker } from './stickers'

// Student portal → Rewards shop: spend the points from the newspaper and the quiz on simple stationery.
export default function StudentRewards() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <StudentPageIntro eyebrow="Your points, your prizes" title="Rewards shop" sticker="wrapped-gift" tone="pink"
        description="Read the newspaper and take quizzes to earn points, then pick a reward. Collect it from your school office."
        aside={<span className="sb-chip" data-size="lg" data-tone="yellow"><Sticker name="sparkles" size="xs" />Points only, no money</span>} />
      <RewardsShop viewUrl="/api/student/rewards" orderUrl="/api/student/rewards" cancelUrl={id => `/api/student/rewards/orders/${id}/cancel`} />
    </div>
  )
}
