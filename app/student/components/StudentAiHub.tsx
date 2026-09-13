'use client'

type AiTool = { name: string; emoji: string; description: string; url: string; accent: string }

const AI_TOOLS: AiTool[] = [
  {
    name: 'Gemini',
    emoji: '✨',
    description: "Google's AI assistant — quick explanations and step-by-step help for most subjects.",
    url: 'https://gemini.google.com',
    accent: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    name: 'Claude',
    emoji: '🟣',
    description: "Anthropic's AI assistant — patient, detailed breakdowns of tricky concepts.",
    url: 'https://claude.ai',
    accent: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  {
    name: 'ChatGPT',
    emoji: '💬',
    description: "OpenAI's AI assistant — wide subject coverage and practice questions.",
    url: 'https://chatgpt.com',
    accent: 'bg-green-50 border-green-200 text-green-700',
  },
]

export default function StudentAiHub({ tier }: { tier: 'ai_basic' | 'ai_pro' | 'none' | null }) {
  if (tier === 'ai_pro') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="text-4xl mb-3">🚀</div>
        <h2 className="text-lg font-bold text-gray-900">AI Pro is coming soon</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          Your school has AI Pro assigned, but the full doubt-clearing chatbot isn&apos;t available yet. Check back soon.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">AI Hub</h1>
      <p className="text-sm text-gray-500 mb-5">Pick the AI that best fits your doubt:</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {AI_TOOLS.map(tool => (
          <div key={tool.name} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg mb-3 ${tool.accent}`}>
              {tool.emoji}
            </div>
            <h3 className="font-bold text-gray-900 text-sm">{tool.name}</h3>
            <p className="text-xs text-gray-500 mt-1.5 flex-1">{tool.description}</p>
            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-center text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white px-3 py-2.5 rounded-xl transition-colors"
            >
              Open {tool.name} ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
