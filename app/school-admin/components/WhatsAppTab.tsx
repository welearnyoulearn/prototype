'use client'

import { useEffect, useState } from 'react'

type Config = {
  configured: boolean
  phone_number_id?: string
  waba_id?: string
  fee_reminder_template?: string
  payment_receipt_template?: string
  is_active?: boolean
  updated_at?: string
}

type Message = {
  id: number
  recipient_phone: string
  recipient_name: string | null
  message_type: string
  template_name: string
  status: string
  failure_reason: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  created_at: string
}

type Usage = {
  year_month: string
  total_sent: number
  by_type: Record<string, number>
}

export default function WhatsAppTab({ schoolId }: { schoolId: number }) {
  const [config, setConfig]     = useState<Config>({ configured: false })
  const [messages, setMessages] = useState<Message[]>([])
  const [usage, setUsage]       = useState<Usage | null>(null)
  const [loading, setLoading]   = useState(true)
  const [subTab, setSubTab]     = useState<'history' | 'settings'>('history')

  // Settings form
  const [token, setToken]                   = useState('')
  const [showToken, setShowToken]           = useState(false)
  const [phoneNumberId, setPhoneNumberId]   = useState('')
  const [wabaId, setWabaId]                 = useState('')
  const [reminderTpl, setReminderTpl]       = useState('')
  const [receiptTpl, setReceiptTpl]         = useState('')
  const [active, setActive]                 = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [saveMsg, setSaveMsg]               = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/whatsapp-config?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/whatsapp/messages?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/whatsapp/usage?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([cfg, msgs, usg]) => {
      setConfig(cfg)
      if (cfg.configured) {
        setPhoneNumberId(cfg.phone_number_id || '')
        setWabaId(cfg.waba_id || '')
        setReminderTpl(cfg.fee_reminder_template || '')
        setReceiptTpl(cfg.payment_receipt_template || '')
        setActive(cfg.is_active ?? false)
      }
      setMessages(msgs.messages || [])
      setUsage(usg.total_sent !== undefined ? usg : null)
    }).finally(() => setLoading(false))
  }, [schoolId])

  async function saveConfig() {
    setSaving(true); setSaveMsg('')
    try {
      const res = await fetch('/api/whatsapp-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          access_token: token || '••••••••',
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          fee_reminder_template: reminderTpl,
          payment_receipt_template: receiptTpl,
          is_active: active,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveMsg(data.error || 'Failed to save'); return }
      setSaveMsg('Saved successfully')
      setConfig(prev => ({ ...prev, configured: true, phone_number_id: phoneNumberId, waba_id: wabaId, fee_reminder_template: reminderTpl, payment_receipt_template: receiptTpl, is_active: active }))
      setToken('')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch { setSaveMsg('Failed to save') }
    finally { setSaving(false) }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      sent: 'bg-blue-100 text-blue-700',
      delivered: 'bg-green-100 text-green-700',
      read: 'bg-purple-100 text-purple-700',
      failed: 'bg-red-100 text-red-700',
    }
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">WhatsApp Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">Send fee reminders and payment receipts via WhatsApp (Meta Cloud API)</p>
        </div>
        {config.configured && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {config.is_active ? '● Active' : '○ Inactive'}
          </span>
        )}
      </div>

      {/* Usage summary */}
      {usage && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Sent this month</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{usage.total_sent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Reminders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{usage.by_type['fee_reminder'] || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Receipts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{usage.by_type['payment_receipt'] || 0}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {(['history', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${subTab === t ? 'text-green-700 bg-green-50 border-b-2 border-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            {t === 'history' ? 'Message History' : 'Settings'}
          </button>
        ))}
      </div>

      {subTab === 'history' && (
        <>
          {messages.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No messages sent yet</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Recipient</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {messages.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{m.recipient_name || m.recipient_phone}</p>
                        <p className="text-xs text-gray-400">{m.recipient_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 capitalize">{m.message_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3">{statusBadge(m.status)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">WhatsApp Configuration</p>
            <p className="text-xs text-gray-400 mb-4">
              Credentials are set by the platform admin. Contact WLYL admin if you need to change these.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Access Token {config.configured && <span className="text-gray-400">(leave blank to keep existing)</span>}</label>
              <div className="relative">
                <input type={showToken ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)}
                  placeholder={config.configured ? '••••••••' : 'Enter Meta access token'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={() => setShowToken(v => !v)} className="absolute right-2 top-2 text-gray-400 text-xs">{showToken ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Phone Number ID</label>
              <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="e.g. 123456789012345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">WABA ID <span className="text-gray-400">(optional)</span></label>
              <input value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Fee Reminder Template Name</label>
              <input value={reminderTpl} onChange={e => setReminderTpl(e.target.value)} placeholder="e.g. fee_reminder"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Payment Receipt Template Name</label>
              <input value={receiptTpl} onChange={e => setReceiptTpl(e.target.value)} placeholder="e.g. payment_receipt"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setActive(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {saveMsg && <p className={`text-sm ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{saveMsg}</p>}

          <button onClick={saveConfig} disabled={saving || !phoneNumberId.trim()}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
