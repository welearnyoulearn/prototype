'use client'

import { useState } from 'react'

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
  const [activeTab, setActiveTab] = useState<'study_guide' | 'textbook' | 'media' | 'quiz'>('study_guide')

  // Parse questions safely
  let parsedQuestions: Question[] = []
  if (topic.questions) {
    if (typeof topic.questions === 'string') {
      try {
        parsedQuestions = JSON.parse(topic.questions)
      } catch (e) {
        console.error('Failed to parse questions JSON string', e)
      }
    } else if (Array.isArray(topic.questions)) {
      parsedQuestions = topic.questions
    }
  }

  // Parse resources
  const resources: Resource[] = Array.isArray(topic.resources) ? topic.resources : []

  // Quiz States
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({}) // questionIndex -> optionIndex
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)

  const handleSelectOption = (qIdx: number, oIdx: number) => {
    if (submitted) return
    setSelectedAnswers(prev => ({ ...prev, [qIdx]: oIdx }))
  }

  const handleSubmitQuiz = () => {
    if (submitted) return
    let correctCount = 0
    parsedQuestions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.answer) {
        correctCount++
      }
    })
    setScore(correctCount)
    setSubmitted(true)
  }

  const handleResetQuiz = () => {
    setSelectedAnswers({})
    setSubmitted(false)
    setScore(0)
  }

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
          <h3 key={idx} className="text-xl font-bold text-gray-800 mt-6 mb-3 border-b border-gray-100 pb-2">
            {trimmed.replace('## ', '')}
          </h3>
        )
      } else if (trimmed.startsWith('### ')) {
        if (insideList) {
          insideList = false
        }
        elements.push(
          <h4 key={idx} className="text-lg font-bold text-gray-700 mt-4 mb-2">
            {trimmed.replace('### ', '')}
          </h4>
        )
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!insideList) {
          insideList = true
        }
        const itemText = trimmed.substring(2)
        elements.push(
          <div key={idx} className="flex items-start gap-2.5 my-1.5 pl-4">
            <span className="text-indigo-500 font-bold mt-1.5 select-none text-[8px]">•</span>
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      {/* Modal Card */}
      <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300">
              {role === 'teacher' ? '📚 Topic Overview (Teacher Portal)' : '🎒 Learning Journey'}
            </span>
            <h2 className="text-xl font-extrabold truncate mt-0.5">{topic.topic_name}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all focus:outline-none"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2 flex gap-1 sm:gap-2 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setActiveTab('study_guide')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'study_guide'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-800'
            }`}
          >
            📚 Study Guide
          </button>
          <button
            onClick={() => setActiveTab('textbook')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'textbook'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-800'
            }`}
          >
            📖 Textbook Reference
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'media'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-800'
            }`}
          >
            🔗 Media & Attachments
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'quiz'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-800'
            }`}
          >
            ❓ Assessment Questions
            {parsedQuestions.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 ${
                activeTab === 'quiz' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'
              }`}>
                {parsedQuestions.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white min-h-0">
          
          {/* TAB 1: STUDY GUIDE */}
          {activeTab === 'study_guide' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100/50 flex gap-4 items-start mb-6">
                <span className="text-2xl mt-0.5 select-none">✨</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Welcome to your Interactive Study Guide!</h4>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                    Review and learn the concepts below. This guide covers core syllabus benchmarks set by the board and your school.
                  </p>
                </div>
              </div>
              <div className="prose max-w-none">
                {renderContentText(topic.content_text || '')}
              </div>
            </div>
          )}

          {/* TAB 2: TEXTBOOK REFERENCE */}
          {activeTab === 'textbook' && (
            <div className="max-w-3xl mx-auto h-full flex flex-col">
              {topic.content_pdf_url ? (
                <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="px-5 py-3.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Primary Textbook PDF</span>
                        <p className="text-[10px] text-slate-400">Linked standard reference material</p>
                      </div>
                    </div>
                    <a
                      href={topic.content_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                    >
                      Open in New Tab
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
                <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">No textbook PDF linked</h3>
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
              <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
                🎥 Topic Video Lessons &amp; Files
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {resources.length} attachment{resources.length !== 1 ? 's' : ''}
                </span>
              </h3>
              
              {resources.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {resources.map(res => (
                    <div 
                      key={res.id} 
                      className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/[0.03] transition-all flex items-start gap-4"
                    >
                      {getFileIcon(res.url, res.resource_type)}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate leading-normal" title={res.title}>
                          {res.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5 block">
                          {res.resource_type}
                        </span>
                        <div className="flex gap-2 mt-3">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg text-[10px] font-bold transition-colors"
                          >
                            Open Link
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">No additional media resources</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                    There are no dynamic video explanations, external links, or supplementary slides attached to this topic.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PRACTICE QUIZ */}
          {activeTab === 'quiz' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {parsedQuestions.length > 0 ? (
                <>
                  {/* Status Banner */}
                  {submitted ? (
                    <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 flex items-center gap-4">
                      <div className="text-3xl">🏆</div>
                      <div className="flex-1">
                        <h4 className="font-bold text-emerald-800 text-sm">Quiz Submitted!</h4>
                        <p className="text-emerald-600 text-xs mt-1">
                          You scored <span className="font-extrabold text-sm">{score}</span> out of <span className="font-extrabold text-sm">{parsedQuestions.length}</span> (
                          {Math.round((score / parsedQuestions.length) * 100)}%)
                        </p>
                      </div>
                      <button
                        onClick={handleResetQuiz}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center gap-4">
                      <div className="text-3xl">🎯</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Interactive Practice Quiz</h4>
                        <p className="text-slate-500 text-xs mt-1">
                          Select the correct answers for each multiple-choice question. Press &quot;Submit Answers&quot; when you are finished!
                        </p>
                      </div>
                    </div>
                  )}

                  {/* MCQ List */}
                  <div className="space-y-6">
                    {parsedQuestions.map((q, qIdx) => {
                      const selectedOption = selectedAnswers[qIdx]
                      const isCorrect = selectedOption === q.answer

                      return (
                        <div key={qIdx} className="bg-white rounded-2xl border border-slate-150 p-5 shadow-sm space-y-4">
                          <div className="flex gap-2.5 items-start">
                            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                              {qIdx + 1}
                            </span>
                            <h4 className="font-bold text-slate-800 text-sm leading-normal">
                              {q.q}
                            </h4>
                          </div>

                          <div className="grid gap-2.5">
                            {q.options.map((opt, oIdx) => {
                              const isSelected = selectedOption === oIdx
                              
                              let optionStyle = 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                              let checkIcon = null

                              if (submitted) {
                                if (isSelected) {
                                  if (isCorrect) {
                                    optionStyle = 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    checkIcon = <span className="text-emerald-500 font-bold text-sm">✓</span>
                                  } else {
                                    optionStyle = 'bg-red-50 border-red-300 text-red-800'
                                    checkIcon = <span className="text-red-500 font-bold text-sm">✕</span>
                                  }
                                } else if (oIdx === q.answer) {
                                  optionStyle = 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                                  checkIcon = <span className="text-emerald-500 font-bold text-sm">✓</span>
                                } else {
                                  optionStyle = 'border-slate-100 text-slate-400 opacity-60'
                                }
                              } else if (isSelected) {
                                optionStyle = 'bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-2 ring-indigo-500/10'
                              }

                              return (
                                <button
                                  key={oIdx}
                                  onClick={() => handleSelectOption(qIdx, oIdx)}
                                  disabled={submitted}
                                  className={`w-full text-left px-4 py-3 rounded-xl border text-xs transition-all flex items-center justify-between gap-3 ${optionStyle}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : 'border-slate-300 text-slate-400'
                                    }`}>
                                      {String.fromCharCode(65 + oIdx)}
                                    </span>
                                    <span>{opt}</span>
                                  </div>
                                  {checkIcon}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Submission Button */}
                  {!submitted && (
                    <button
                      onClick={handleSubmitQuiz}
                      disabled={Object.keys(selectedAnswers).length < parsedQuestions.length}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/10 transition-all flex items-center justify-center gap-2"
                    >
                      Submit Answers ({Object.keys(selectedAnswers).length}/{parsedQuestions.length})
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">No assessment questions</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                    The course administrators have not added MCQ questions to this topic yet.
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
