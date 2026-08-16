'use client'

// Bulk JSON import panel with the Copy-ChatGPT-prompt helper — the prototype's
// headline feature, ported as a shared component. The textarea keeps focus
// across renders because state lives here, not in a parent that remounts it.

import { useState } from 'react'
import { Upload, X, Sparkles, Copy, ExternalLink, AlertTriangle } from 'lucide-react'
import { INK, PURPLE, CREAM, BORDER } from './theme'

export type BulkAction = {
  label: string
  color: string
  onClick: (text: string) => void
}

export function BulkImportPanel({
  title,
  hint,
  example,
  prompt,
  actions,
  error,
  onClose,
  onCopyPrompt,
}: {
  title: string
  hint: string
  example: string
  prompt?: string
  actions: BulkAction[]
  error?: string
  onClose: () => void
  onCopyPrompt?: (text: string) => void
}) {
  const [text, setText] = useState('')

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3" style={{ borderColor: PURPLE }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2" style={{ color: INK }}>
          <Upload size={14} style={{ color: PURPLE }} /> {title}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400" aria-label="Close import panel">
          <X size={15} />
        </button>
      </div>
      <div className="text-xs text-gray-400">{hint}</div>

      {prompt && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2.5" style={{ background: CREAM }}>
          <Sparkles size={14} style={{ color: PURPLE }} className="shrink-0" />
          <span className="text-xs text-gray-600 flex-1 min-w-[10rem]">
            Don&apos;t have the JSON yet? Copy this prompt, attach your chapter PDF in ChatGPT, and paste back what it returns.
          </span>
          <button
            onClick={() => onCopyPrompt?.(prompt)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-white font-medium shadow-sm"
            style={{ background: PURPLE }}
          >
            <Copy size={13} /> Copy ChatGPT prompt
          </button>
          <a
            href="https://chatgpt.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium hover:bg-white"
            style={{ color: INK }}
          >
            <ExternalLink size={13} /> Ask ChatGPT
          </a>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={9}
        placeholder={example}
        className="w-full border rounded-lg px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2"
        style={{ borderColor: BORDER, color: INK }}
      />

      {error && (
        <div className="flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-2" style={{ background: '#FCEBEB', color: '#791F1F' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setText(example)}
          className="text-xs px-3 py-1.5 rounded-lg border font-medium hover:bg-gray-50"
        >
          Load example
        </button>
        <div className="flex-1" />
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => a.onClick(text)}
            className="text-sm px-3 py-1.5 rounded-lg text-white font-medium shadow-sm"
            style={{ background: a.color }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
