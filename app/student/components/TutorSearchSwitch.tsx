// Student Search (#538): two buttons above the AI screen and the Search screen to move between them. The screens
// themselves stay separate and keep what is on them.
import { Sticker } from './stickers'

type Screen = 'ai-hub' | 'search'
type Props = { active: Screen; aiLabel: string; onSelect: (screen: Screen) => void }

export default function TutorSearchSwitch({ active, aiLabel, onSelect }: Props) {
  const choices = [
    { key: 'ai-hub', label: aiLabel, sticker: 'robot' },
    { key: 'search', label: 'Search', sticker: 'magnifying-glass' },
  ] as const
  return (
    <nav className="mb-4 flex justify-center gap-3" aria-label={`${aiLabel} or Search`} data-testid="student-tutor-search-switch">
      {choices.map(choice => (
        <button key={choice.key} type="button" onClick={() => onSelect(choice.key)} aria-current={active === choice.key ? 'page' : undefined}
          className="sb-btn" data-size="sm" data-variant={active === choice.key ? undefined : 'ghost'} data-testid={`student-switch-${choice.key}`}>
          <Sticker name={choice.sticker} size="xs" />{choice.label}
        </button>
      ))}
    </nav>
  )
}
