'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { StudentEmptyState, StudentPageIntro, studentReveal } from './StudentExperience'
import { Sticker, type StickerName, type Tone } from './stickers'

type AiTool = {
  name: string
  description: string
  url: string
  sticker: StickerName
  tone: Tone
  detail: string
}

const AI_TOOLS: AiTool[] = [
  { name: 'Gemini', description: "Google's AI assistant for explanations and step-by-step help across subjects.", url: 'https://gemini.google.com', sticker: 'light-bulb', tone: 'blue', detail: 'Quick explanations' },
  { name: 'Claude', description: "Anthropic's AI assistant for patient, detailed breakdowns of difficult concepts.", url: 'https://claude.ai', sticker: 'brain', tone: 'orange', detail: 'Detailed breakdowns' },
  { name: 'ChatGPT', description: "OpenAI's AI assistant for broad subject support and practice questions.", url: 'https://chatgpt.com', sticker: 'speech-balloon', tone: 'mint', detail: 'Practice and support' },
]

const INTRO = { eyebrow: 'School-enabled AI', title: 'AI Hub', sticker: 'robot' as const, tone: 'orange' as const }

export default function StudentAiHub({ tier }: { tier: 'ai_basic' | 'ai_pro' | 'none' | null }) {
  const reduceMotion = useReducedMotion()

  if (tier === 'ai_pro') {
    return (
      <div className="mx-auto max-w-3xl space-y-7">
        <StudentPageIntro {...INTRO} description="Your school controls which assisted-learning tools are available in this workspace." />
        <StudentEmptyState sticker="sparkles" tone="violet" title="AI Pro is being prepared" description="Your school has assigned AI Pro. The full doubt-clearing experience is not available yet, so there is nothing you need to set up." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-9">
      <StudentPageIntro {...INTRO} description="Pick the assistant that matches how you want a concept explained. Each one opens in a new tab."
        aside={<span className="sb-chip" data-size="lg" data-tone="violet"><Sticker name="sparkles" size="xs" />AI Basic access</span>} />

      <div className="sb-windows">
        {AI_TOOLS.map((tool, index) => (
          <motion.a key={tool.name} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible"
            href={tool.url} target="_blank" rel="noopener noreferrer" data-testid={`ai-tool-${tool.name.toLowerCase()}`}
            className="sb-window sb-press" data-tone={tool.tone} aria-label={`Open ${tool.name} in a new tab — ${tool.detail}`}>
            <span className="sb-window-bar" aria-hidden="true"><i /><i /><i /><span className="ml-1 truncate">{tool.name}.exe</span></span>
            <span className="sb-window-body">
              <Sticker name={tool.sticker} size="xl" tilt={index % 2 ? 8 : -8} />
              <span className="sb-chip w-fit" data-tone={tool.tone}>{tool.detail}</span>
              <span className="sb-display text-2xl">{tool.name}</span>
              <span className="text-sm leading-6 text-[#4a4034]">{tool.description}</span>
              <span className="sb-btn mt-auto w-fit" data-size="sm" data-tone="yellow">Open <ArrowUpRight size={15} aria-hidden="true" /></span>
            </span>
          </motion.a>
        ))}
      </div>

      <div className="sb-note max-w-xl" data-tone="yellow" style={{ '--tilt': '-1deg' } as React.CSSProperties}>
        <p className="sb-hand flex items-center gap-2 text-2xl">quick tip <Sticker name="pencil" size="sm" tilt={-20} /></p>
        <p className="mt-1 text-sm font-semibold">Use AI as a study buddy, not an answer machine — check important answers with your teacher or textbook.</p>
      </div>
    </div>
  )
}
