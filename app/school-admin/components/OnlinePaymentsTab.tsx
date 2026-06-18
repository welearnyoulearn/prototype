'use client'

import { useEffect, useState } from 'react'

type Transaction = {
  id: number
  cashfree_order_id: string
  payment_link: string
  amount: number
  status: string
  student_name: string
  grade: string
  section: string
  parent_name: string | null
  parent_phone: string | null
  created_at: string
  updated_at: string
}

type Config = {
  configured: boolean
  cashfree_app_id?: string
  is_active?: boolean
  updated_at?: string
}

export default function OnlinePaymentsTab({ schoolId }: { schoolId: number }) {
  const [config, setConfig] = useState<Config>({ configured: false })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'transactions' | 'settings'>('transactions')

  // Settings form
  const [appId, setAppId]     = useState('')
  const [secret, setSecret]   = useState('')
  const [active, setActive]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/payment-config?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/payments/transactions?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([cfg, txns]) => {
      setConfig(cfg)
      if (cfg.configured) {
        setAppId(cfg.cashfree_app_id || '')
        setActive(cfg.is_active ?? false)
      }
      setTransactions(txns.transactions || [])
    }).finally(() => setLoading(false))
  }, [schoolId])

  async function saveConfig() {
    setSaving(true); setSaveMsg('')
    try {
      const res = await fetch('/api/payment-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, cashfree_app_id: appId, cashfree_secret: secret, is_active: active }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveMsg(data.error || 'Failed to save'); return }
      setSaveMsg('Saved successfully')
      setConfig(prev => ({ ...prev, configured: true, cashfree_app_id: appId, is_active: active }))
      setSecret('')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch { setSaveMsg('Failed to save') }
    finally { setSaving(false) }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PAID: 'bg-green-100 text-green-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      FAILED: 'bg-red-100 text-red-700',
      EXPIRED: 'bg-gray-100 text-gray-500',
    }
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Online Fee Payments</h2>
          <p className="text-xs text-gray-500 mt-0.5">Parents pay directly via Cashfree — money goes straight to school bank</p>
        </div>
        {config.configured && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {config.is_active ? '● Active' : '○ Inactive'}
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['transactions', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${subTab === t ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            {t === 'transactions' ? 'Transaction History' : 'Settings'}
          </button>
        ))}
      </div>

      {subTab === 'transactions' && (
        <>
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No transactions yet</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Order ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{t.student_name}</p>
                        <p className="text-xs text-gray-500">{t.grade} {t.section}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">₹{Number(t.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">{statusBadge(t.status)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{t.cashfree_order_id}</td>
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cashfree Credentials</p>
            <p className="text-xs text-gray-400 mb-4">
              Get these from your Cashfree merchant dashboard → Developers → API Keys.
              The secret is encrypted and never shown again after saving.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">App ID</label>
              <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="CF_APP_ID_..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Secret Key {config.configured && <span className="text-gray-400">(leave blank to keep existing)</span>}</label>
              <input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={config.configured ? '••••••••' : 'Enter secret key'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setActive(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${active ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{active ? 'Active — online payments enabled' : 'Inactive — online payments disabled'}</span>
            </div>
          </div>

          {saveMsg && <p className={`text-sm ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{saveMsg}</p>}

          <button onClick={saveConfig} disabled={saving || !appId.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
