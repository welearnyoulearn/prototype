'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, FileText, Link2, X } from 'lucide-react'

type Resource = {
  id: number
  title: string
  url: string
  resource_type: string
}

type Question = {
  q: string
  options: string[]
  answer: number // index 0-3
}

type Topic = {
  id: number
  topic_name: string
  content_text?: string
  content_pdf_url?: string
  subtopics?: string[]
  questions?: Question[] | string | null
  resources?: Resource[] | null
  status?: string
}

type Props = {
  topic: Topic
  onClose: () => void
  role: 'teacher' | 'student'
}

export default function TopicContentViewer({ topic, onClose, role }: Props) {
  const [activeTab, setActiveTab] = useState<'study_guide' | 'textbook' | 'media'>('study_guide')
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Parse resources
  const resources: Resource[] = Array.isArray(topic.resources) ? topic.resources : []

  // A helper function to parse simple markdown safely and render it beautifully
  const renderContentText = (text: string) => {
    if (!text.trim()) return <p className="text-gray-400 italic">No study guide content available.</p>

    const lines = text.split('\n')
    let insideList = false
    const elements: React.ReactNode[] = []

    lines.forEach((line, idx) => {
      const trimmed = line.trim()

      if (trimmed.startsWith('## ')) {
        if (insideList) {
          insideList = false
        }
        elements.push(
          <h3 key={idx} className="mb-3 mt-7 border-b border-gray-100 pb-2 text-xl font-semibold text-gray-900">
            {trimmed.replace('## ', '')}
          </h3>
        )
      } else if (trimmed.startsWith('### ')) {
        if (insideList) {
          insideList = false
        }
        elements.push(
          <h4 key={idx} className="mb-2 mt-5 text-lg font-semibold text-gray-800">
            {trimmed.replace('### ', '')}
          </h4>
        )
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!insideList) {
          insideList = true
        }
        const itemText = trimmed.substring(2)
        elements.push(
          <div key={idx} className="my-1.5 flex items-start gap-2.5 pl-4">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-green-600" aria-hidden="true" />
            <span className="text-gray-600 text-sm leading-relaxed flex-1">
              {parseInlineStyles(itemText)}
            </span>
          </div>
        )
      } else if (trimmed === '') {
        if (insideList) {
          insideList = false
        }
        elements.push(<div key={idx} className="h-3" />)
      } else {
        if (insideList) {
          insideList = false
        }
        elements.push(
          <p key={idx} className="text-gray-600 text-sm leading-relaxed my-2">
            {parseInlineStyles(trimmed)}
          </p>
        )
      }
    })

    return <div className="space-y-1">{elements}</div>
  }

  // Parse **bold** and *italic* and `code` inline
  const parseInlineStyles = (text: string) => {
    // Basic regex replacing
    let parts: { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] = [{ text }]

    // Bold pattern: **text**
    const boldRegex = /\*\*(.*?)\*\*/g
    let newParts: typeof parts = []
    parts.forEach(p => {
      if (p.bold || p.italic || p.code) {
        newParts.push(p)
        return
      }
      let lastIndex = 0
      let match
      const currentText = p.text
      while ((match = boldRegex.exec(currentText)) !== null) {
        const matchIndex = match.index
        if (matchIndex > lastIndex) {
          newParts.push({ text: currentText.substring(lastIndex, matchIndex) })
        }
        newParts.push({ text: match[1], bold: true })
        lastIndex = boldRegex.lastIndex
      }
      if (lastIndex < currentText.length) {
        newParts.push({ text: currentText.substring(lastIndex) })
      }
    })
    parts = newParts

    // Italic pattern: *text*
    const italicRegex = /\*(.*?)\*/g
    newParts = []
    parts.forEach(p => {
      if (p.bold || p.italic || p.code) {
        newParts.push(p)
        return
      }
      let lastIndex = 0
      let match
      const currentText = p.text
      while ((match = italicRegex.exec(currentText)) !== null) {
        const matchIndex = match.index
        if (matchIndex > lastIndex) {
          newParts.push({ text: currentText.substring(lastIndex, matchIndex) })
        }
        newParts.push({ text: match[1], italic: true })
        lastIndex = italicRegex.lastIndex
      }
      if (lastIndex < currentText.length) {
        newParts.push({ text: currentText.substring(lastIndex) })
      }
    })
    parts = newParts

    // Code pattern: `code`
    const codeRegex = /`(.*?)`/g
    newParts = []
    parts.forEach(p => {
      if (p.bold || p.italic || p.code) {
        newParts.push(p)
        return
      }
      let lastIndex = 0
      let match
      const currentText = p.text
      while ((match = codeRegex.exec(currentText)) !== null) {
        const matchIndex = match.index
        if (matchIndex > lastIndex) {
          newParts.push({ text: currentText.substring(lastIndex, matchIndex) })
        }
        newParts.push({ text: match[1], code: true })
        lastIndex = codeRegex.lastIndex
      }
      if (lastIndex < currentText.length) {
        newParts.push({ text: currentText.substring(lastIndex) })
      }
    })
    parts = newParts

    return parts.map((p, idx) => {
      if (p.bold) return <strong key={idx} className="font-semibold text-gray-800">{p.text}</strong>
      if (p.italic) return <em key={idx} className="italic text-gray-700">{p.text}</em>
      if (p.code) return <code key={idx} className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded text-xs font-mono">{p.text}</code>
      return p.text
    })
  }

  const getFileIcon = (url: string, type: string) => {
    const lowerUrl = url.toLowerCase()
    const lowerType = type.toLowerCase()
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerType.includes('video')) {
      return (
        <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </div>
      )
    }
    if (lowerUrl.endsWith('.pdf') || lowerType.includes('pdf') || lowerType.includes('document')) {
      return (
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h1.5m-1.5 3h4m-4 3h4" /></svg>
        </div>
      )
    }
    if (lowerUrl.match(/\.(jpeg|jpg|gif|png|webp)/) || lowerType.includes('image')) {
      return (
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </div>
      )
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-4" onClick={onClose}>
      {/* Modal Card */}
      <div role="dialog" aria-modal="true" aria-labelledby="topic-content-title" onClick={event => event.stopPropagation()} className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-green-700">
              {role === 'teacher' ? 'Teacher topic overview' : 'Learning material'}
            </span>
            <h2 id="topic-content-title" className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">{topic.topic_name}</h2>
          </div>
          <button 
            ref={closeButtonRef}
            onClick={onClose} 
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            aria-label="Close topic content"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-shrink-0 gap-5 overflow-x-auto border-b border-slate-200 bg-white px-5 sm:px-6" role="tablist" aria-label="Topic content">
          <button
            role="tab"
            aria-selected={activeTab === 'study_guide'}
            onClick={() => setActiveTab('study_guide')}
            className={`flex min-h-12 items-center gap-2 whitespace-nowrap border-b-2 px-0 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
              activeTab === 'study_guide'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Study guide
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'textbook'}
            onClick={() => setActiveTab('textbook')}
            className={`flex min-h-12 items-center gap-2 whitespace-nowrap border-b-2 px-0 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
              activeTab === 'textbook'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" /> Textbook
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'media'}
            onClick={() => setActiveTab('media')}
            className={`flex min-h-12 items-center gap-2 whitespace-nowrap border-b-2 px-0 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
              activeTab === 'media'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" /> Resources
          </button>
          {/* FUTURE: Quiz / Assessment Questions tab — removed for now (was
              here, rendering topic.questions as an interactive MCQ practice
              quiz). Grading was entirely client-side and never persisted
              anywhere — no score was ever written to the database, so a
              student's result vanished the moment this modal closed, and
              ParentSyllabus's "avg score" / "not attempted" fields are
              permanently static placeholders with nothing behind them.
              Bringing this back for real needs a persistence story (a
              quiz_attempts-style table, an API route, and ParentSyllabus
              reading from it) before it's shown to users again — not just
              re-adding the tab. topic.questions itself is untouched; only
              the UI that rendered it as a quiz was removed. */}
        </div>

        {/* Tab Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 sm:p-6">
          
          {/* TAB 1: STUDY GUIDE */}
          {activeTab === 'study_guide' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="mb-7 border-l-4 border-green-600 bg-green-50/60 px-4 py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">About this study guide</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Review and learn the concepts below. This guide covers core syllabus benchmarks set by the board and your school.
                  </p>
                </div>
              </div>
              <div className="prose max-w-none">
                {renderContentText(topic.content_text || '')}
              </div>
              {topic.subtopics && topic.subtopics.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Sub-topics</h4>
                  <ul className="space-y-1">
                    {topic.subtopics.map((st, si) => (
                      <li key={si} className="text-sm text-slate-600">— {st}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TEXTBOOK REFERENCE */}
          {activeTab === 'textbook' && (
            <div className="max-w-3xl mx-auto h-full flex flex-col">
              {topic.content_pdf_url ? (
                <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="px-5 py-3.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Primary Textbook PDF</span>
                        <p className="text-xs text-slate-500">Linked standard reference material</p>
                      </div>
                    </div>
                    <a
                      href={topic.content_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                    >
                      Open PDF <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                  {/* Embedded Iframe */}
                  <iframe
                    src={topic.content_pdf_url}
                    className="w-full flex-1 border-none min-h-[400px]"
                    title="Textbook Reference PDF"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">No textbook PDF linked</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                    The platform administrator has not uploaded a digital textbook excerpt for this topic yet.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MEDIA & ATTACHMENTS */}
          {activeTab === 'media' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                Topic resources
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {resources.length} attachment{resources.length !== 1 ? 's' : ''}
                </span>
              </h3>
              
              {resources.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {resources.map(res => (
                    <div 
                      key={res.id} 
                      className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
                    >
                      {getFileIcon(res.url, res.resource_type)}
                      <div className="flex-1 min-w-0">
                        <h4 className="truncate text-sm font-semibold leading-normal text-slate-800" title={res.title}>
                          {res.title}
                        </h4>
                        <span className="mt-0.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                          {res.resource_type}
                        </span>
                        <div className="flex gap-2 mt-3">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-green-50 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                          >
                            Open resource <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">No additional media resources</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                    There are no dynamic video explanations, external links, or supplementary slides attached to this topic.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
