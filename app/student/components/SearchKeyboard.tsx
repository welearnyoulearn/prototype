'use client'

// Student Search (#538): choose a typing language and, for Telugu or Hindi, tap letters into the search box.
// It only changes the text in the box. Searching goes through the same checks as a typed search.
import { useEffect, useState } from 'react'
import { erase, KEYBOARDS, typeText, type KeyboardLanguage, type Typed } from '@/lib/studentSearch/keyboard'
import { MAX_QUERY } from '@/lib/studentSearch/safety'

type Props = { getInput: () => HTMLInputElement | null; onSearch: (query: string) => void }

const LANGUAGES: { value: KeyboardLanguage | null; label: string; id: string }[] = [
  { value: null, label: 'English', id: 'en' },
  { value: 'te', label: KEYBOARDS.te.label, id: 'te' },
  { value: 'hi', label: KEYBOARDS.hi.label, id: 'hi' },
]
const KEY = 'min-h-11 min-w-11 rounded-lg border bg-white px-2 text-lg hover:bg-gray-50'

export default function SearchKeyboard({ getInput, onSearch }: Props) {
  const [language, setLanguage] = useState<KeyboardLanguage | null>(null)
  const board = language ? KEYBOARDS[language] : null

  // While our keyboard is open, a phone must not also open its own over it.
  useEffect(() => {
    const input = getInput()
    if (!input || !language) return
    input.inputMode = 'none'
    return () => { input.inputMode = '' }
  }, [language, getInput])

  const change = (edit: (value: string, start: number, end: number) => Typed) => {
    const input = getInput()
    if (!input) return
    const { value, cursor } = edit(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true })) // lets Google's box show its clear button
    input.focus({ preventScroll: true })
    input.setSelectionRange(cursor, cursor)
  }
  const type = (text: string) => change((value, start, end) => typeText(value, start, end, text, MAX_QUERY))
  const search = () => {
    const query = getInput()?.value ?? ''
    if (!query.trim()) return
    setLanguage(null) // put the keyboard away so the results can be seen
    onSearch(query)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Typing language">
        <span className="text-sm text-gray-600">Type in:</span>
        {LANGUAGES.map(option => (
          <button key={option.id} type="button" aria-pressed={language === option.value} onClick={() => setLanguage(option.value)}
            className={`min-h-10 rounded-full border px-4 text-sm ${language === option.value ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
            data-testid={`student-search-language-${option.id}`}>{option.label}</button>
        ))}
      </div>

      {board && language && (
        // Pressing a key must not take the cursor out of the search box.
        <div className="space-y-3 rounded-2xl border bg-gray-50 p-3" lang={language} onMouseDown={e => e.preventDefault()} data-testid="student-search-keyboard">
          {/* The letters scroll in their own area, so the search box above and the Search key below stay on a phone screen. */}
          <div className="max-h-[38vh] space-y-3 overflow-y-auto overscroll-contain" data-testid="student-search-keys">
          {board.groups.map(group => (
            <div key={group.name} role="group" aria-label={group.name}>
              <p className="mb-1 text-xs text-gray-600">{group.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.keys.map(key => (
                  <button key={key} type="button" className={KEY} onClick={() => type(key)} data-testid={`student-search-key-${key.codePointAt(0)}`}>
                    {group.combining ? `◌${key}` : key}
                  </button>
                ))}
              </div>
            </div>
          ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className={`${KEY} flex-1 text-sm`} onClick={() => type(' ')} data-testid="student-search-key-space">{board.space}</button>
            <button type="button" className={`${KEY} px-4 text-sm`} onClick={() => change(erase)} data-testid="student-search-key-erase">⌫ {board.erase}</button>
            <button type="button" className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white" onClick={search} data-testid="student-search-key-search">{board.search}</button>
          </div>
        </div>
      )}
    </div>
  )
}
