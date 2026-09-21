'use client'

import { useEffect } from 'react'
import { getTemplate } from '@/lib/announcementTemplates'
import GreetingCard from './GreetingCard'
import { localised, type Lang, type NoticeItem } from './types'

const TYPE_LABEL: Record<string, string> = { general: 'General', circular: 'Circular', event: 'Event', alert: 'Alert' }
const T = {
  en: { close: 'Close', thanks: 'Thank you 🙏', ack: '✓ I have read this', acked: 'Acknowledged ✓', needsAck: 'Please confirm you have read this', by: 'Posted by', expires: 'Valid until', pinned: 'Pinned', urgent: 'Urgent', high: 'Important' },
  te: { close: 'మూసివేయి', thanks: 'ధన్యవాదాలు 🙏', ack: '✓ నేను చదివాను', acked: 'ధృవీకరించబడింది ✓', needsAck: 'దయచేసి మీరు చదివినట్లు నిర్ధారించండి', by: 'పంపినవారు', expires: 'చెల్లుబాటు తేదీ', pinned: 'పిన్ చేయబడింది', urgent: 'అత్యవసరం', high: 'ముఖ్యమైనది' },
  hi: { close: 'बंद करें', thanks: 'धन्यवाद 🙏', ack: '✓ मैंने पढ़ लिया', acked: 'पुष्टि हो गई ✓', needsAck: 'कृपया पुष्टि करें कि आपने इसे पढ़ लिया है', by: 'भेजने वाले', expires: 'मान्य तिथि', pinned: 'पिन किया गया', urgent: 'अत्यावश्यक', high: 'महत्वपूर्ण' },
} as const

function fmt(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// What opens when someone taps a notice: an animated greeting card for festive notices, otherwise a clean
// notice sheet (with the template's colourful header when it has one). Asks for acknowledgement when required.
export default function NoticeModal({
  notice, schoolName, lang = 'en', onClose, onAck,
}: {
  notice: NoticeItem
  schoolName?: string
  lang?: Lang
  onClose: () => void
  onAck?: (id: number) => void | Promise<void>
}) {
  const tx = T[lang]
  const template = getTemplate(notice.template_key)
  const { title, content } = localised(notice, lang)
  const headline = notice.card_data?.headline || title
  const isCard = !!template && (template.greeting || !!notice.card_data)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ackButton = notice.requires_ack && (
    notice.acked
      ? <p data-testid="notice-acked" className="text-sm font-semibold text-green-600 text-center py-2">{tx.acked}</p>
      : (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 text-center">{tx.needsAck}</p>
          <button data-testid="notice-ack" onClick={() => onAck?.(notice.id)}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-colors">
            {tx.ack}
          </button>
        </div>
      )
  )

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm overflow-y-auto" onClick={onClose} data-testid="notice-modal">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg my-auto" onClick={e => e.stopPropagation()}>
        {isCard && template ? (
          <div className="space-y-3">
            <GreetingCard template={template} headline={headline} message={content} schoolName={schoolName} />
            {ackButton}
            <button data-testid="notice-close" onClick={onClose}
              className="w-full py-3 rounded-2xl bg-white/95 hover:bg-white text-gray-800 font-bold text-sm shadow-lg transition-colors">
              {tx.thanks}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {template && <GreetingCard template={template} headline={headline} variant="banner" />}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-gray-100 text-gray-600">{TYPE_LABEL[notice.announcement_type] ?? notice.announcement_type}</span>
                {notice.priority === 'urgent' && <span className="text-[10px] font-bold uppercase text-red-600">● {tx.urgent}</span>}
                {notice.priority === 'high' && <span className="text-[10px] font-bold uppercase text-amber-600">● {tx.high}</span>}
                {notice.pinned && <span className="text-[10px] font-bold uppercase text-indigo-600">📌 {tx.pinned}</span>}
              </div>
              {!template && <h2 className="text-lg font-extrabold text-gray-900 leading-snug">{title}</h2>}
              <p data-testid="notice-body" className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content}</p>
              <div className="text-xs text-gray-400 space-y-0.5 pt-1 border-t border-gray-100">
                <p>{tx.by} <span className="font-medium text-gray-500">{notice.created_by_name ?? '—'}</span> · {fmt(notice.published_at ?? notice.created_at)}</p>
                {notice.expires_at && <p>{tx.expires} {fmt(notice.expires_at)}</p>}
              </div>
              {ackButton}
              <button data-testid="notice-close" onClick={onClose}
                className="w-full py-2.5 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
                {tx.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
