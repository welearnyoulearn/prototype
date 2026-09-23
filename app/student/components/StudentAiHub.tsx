'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Bot, MessageSquareText, Sparkles } from 'lucide-react'
import { StudentEmptyState, StudentPageIntro, studentReveal } from './StudentExperience'

type AiTool = {
  name: string
  description: string
  url: string
  icon: typeof Sparkles
  detail: string
}

const AI_TOOLS: AiTool[] = [
  { name: 'Gemini', description: "Google's AI assistant for explanations and step-by-step help across subjects.", url: 'https://gemini.google.com', icon: Sparkles, detail: 'Quick explanations' },
  { name: 'Claude', description: "Anthropic's AI assistant for patient, detailed breakdowns of difficult concepts.", url: 'https://claude.ai', icon: Bot, detail: 'Detailed breakdowns' },
  { name: 'ChatGPT', description: "OpenAI's AI assistant for broad subject support and practice questions.", url: 'https://chatgpt.com', icon: MessageSquareText, detail: 'Practice and support' },
]

export default function StudentAiHub({ tier }: { tier: 'ai_basic' | 'ai_pro' | 'none' | null }) {
  const reduceMotion = useReducedMotion()

  if (tier === 'ai_pro') {
    return (
      <div className="mx-auto max-w-3xl space-y-7">
        <StudentPageIntro eyebrow="School-enabled AI" title="AI Hub" description="Your school controls which assisted-learning tools are available in this workspace." />
        <StudentEmptyState icon={<Sparkles size={22} />} title="AI Pro is being prepared" description="Your school has assigned AI Pro. The full doubt-clearing experience is not available yet, so there is nothing you need to configure." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <StudentPageIntro eyebrow="School-enabled AI" title="AI Hub" description="Choose the assistant that best matches how you want a concept explained. These links open the provider in a new tab." aside={
        <span className="text-xs font-medium text-[#68736b]">AI Basic access</span>
      } />
      <div className="divide-y divide-[#e2ded5] border-y border-[#dcd8cd]">
        {AI_TOOLS.map((tool, index) => {
          const Icon = tool.icon
          return (
            <motion.a key={tool.name} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible" href={tool.url} target="_blank" rel="noopener noreferrer"
              className="group grid min-h-32 items-center gap-5 px-2 py-6 transition-colors hover:bg-[#f5eee2] sm:grid-cols-[46px_150px_1fr_auto] sm:px-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f1e2ca] text-[#8b4a10]" aria-hidden="true"><Icon size={19} /></span>
              <span><span className="block text-sm font-semibold text-[#202a25]">{tool.name}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8a928c]">{tool.detail}</span></span>
              <span className="text-sm leading-6 text-[#68736b]">{tool.description}</span>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#6f3b0b]">Open <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </motion.a>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-[#7a837c]">Use AI suggestions as study support and check important answers against your teacher or textbook.</p>
    </div>
  )
}
