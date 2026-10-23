'use client'

export type MascotMood = 'bob' | 'excited' | 'sad'

const MOOD_ANIMATION: Record<MascotMood, string> = {
  bob: 'anim-feedback-mascot-bob',
  excited: 'anim-feedback-mascot-jump',
  sad: 'anim-feedback-mascot-sway',
}

// Every wizard step shows an animated mascot at the top — matches the
// SchoolPulse prototype's per-screen mascot (role icon on categories, a
// mood-reactive face on the rating screen, etc.), which the first build of
// this wizard dropped.
export default function MascotHeader({ emoji, mood = 'bob' }: { emoji: string; mood?: MascotMood }) {
  return <div className={`text-center text-5xl mb-2 ${MOOD_ANIMATION[mood]}`}>{emoji}</div>
}

// Maps a 1-5 rating to the face + mood used consistently on the Rating and
// Follow-up screens, so the mascot reinforces what was just selected/felt
// overall rather than sitting static.
export function moodForRating(rating: number): { emoji: string; mood: MascotMood } {
  if (rating <= 1) return { emoji: '😭', mood: 'sad' }
  if (rating <= 2) return { emoji: '😞', mood: 'sad' }
  if (rating === 3) return { emoji: '😐', mood: 'bob' }
  if (rating === 4) return { emoji: '😊', mood: 'bob' }
  return { emoji: '🤩', mood: 'excited' }
}
