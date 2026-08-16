'use client'

// Small toast helper matching the prototype's `flash()` — shows a message for a
// few seconds. Also exposes copyPrompt, used by the bulk-import panel.
import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current)
    setToast(message)
    timer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const copyPrompt = useCallback(
    (text: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => flash('Prompt copied — open ChatGPT, attach your chapter PDF, and paste it.'))
          .catch(() => flash("Couldn't copy automatically — select the prompt text manually."))
      } else {
        flash('Clipboard unavailable here — select the prompt text manually.')
      }
    },
    [flash],
  )

  return { toast, flash, copyPrompt }
}
