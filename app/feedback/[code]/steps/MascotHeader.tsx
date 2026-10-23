'use client'

import MoodFace from '../MoodFace'
import { HeroIcon } from '../CategoryIcon'

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
// With `rating`, the mascot is the custom 3D MoodFace (animated) instead of a
// system emoji.
export default function MascotHeader({ emoji, mood = 'bob', rating }: { emoji: string; mood?: MascotMood; rating?: number }) {
  if (rating) {
    return (
      <div className={`mb-2 flex justify-center ${MOOD_ANIMATION[mood]}`}>
        <MoodFace key={rating} rating={rating} size={76} animated className="anim-feedback-emoji-pop" />
      </div>
    )
  }
  return <HeroIcon icon={emoji} size={72} motion={mood === 'excited' ? 'excited' : mood === 'sad' ? 'sad' : 'bob'} />
}

// Maps a 1-5 rating to the face + mood used consistently on the Rating and
// Follow-up screens, so the mascot reinforces what was just selected/felt
// overall rather than sitting static.
export function moodForRating(rating: number): { emoji: string; mood: MascotMood; rating: number } {
  if (rating <= 1) return { emoji: '😭', mood: 'sad', rating: 1 }
  if (rating <= 2) return { emoji: '😞', mood: 'sad', rating: 2 }
  if (rating === 3) return { emoji: '😐', mood: 'bob', rating: 3 }
  if (rating === 4) return { emoji: '😊', mood: 'bob', rating: 4 }
  return { emoji: '🤩', mood: 'excited', rating: 5 }
}
