'use client'

export type PaymentLedgerEntry = {
  id: number
  student_id: number
  student_name: string
  grade: string
  section: string
  category_name: string
  period_label: string
  balance: number
  parent_name?: string | null
  parent_phone?: string | null
  parent_email?: string | null
}

type Props = {
  entry: PaymentLedgerEntry
  schoolId: number
  onClose: () => void
}

export default function SendPaymentLinkModal({ entry, schoolId, onClose }: Props) {
  const noPhone = !entry.parent_phone?.trim()

  async function handleSend() {
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          student_id: entry.student_id,
          ledger_ids: [entry.id],
          parent_name: entry.parent_name,
          parent_phone: entry.parent_phone,
          parent_email: entry.parent_email,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create payment link'); return }

      // Copy link to clipboard and alert
      if (data.payment_link) {
        await navigator.clipboard.writeText(data.payment_link).catch(() => {})
        alert(`Payment link created!\n\n${data.payment_link}\n\n(Link copied to clipboard — share it with the parent via WhatsApp/SMS)`)
      }
      onClose()
    } catch {
      alert('Failed to create payment link')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-blue-600 px-6 py-5">
          <h3 className="text-white font-bold text-base">Send Payment Link</h3>
          <p className="text-blue-200 text-xs mt-0.5">Cashfree — money goes directly to school bank</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-400 text-xs">Student</span><p className="font-medium text-gray-900">{entry.student_name}</p></div>
            <div><span className="text-gray-400 text-xs">Class</span><p className="font-medium text-gray-900">{entry.grade} {entry.section}</p></div>
            <div><span className="text-gray-400 text-xs">Fee</span><p className="font-medium text-gray-900">{entry.category_name} — {entry.period_label}</p></div>
            <div><span className="text-gray-400 text-xs">Amount</span><p className="font-bold text-blue-700">₹{Number(entry.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
            <div><span className="text-gray-400 text-xs">Parent</span><p className="font-medium text-gray-900">{entry.parent_name || '—'}</p></div>
            <div><span className="text-gray-400 text-xs">Phone</span><p className={`font-medium ${noPhone ? 'text-amber-600' : 'text-gray-900'}`}>{entry.parent_phone || 'Not on record'}</p></div>
          </div>

          {noPhone && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              ⚠ No parent phone on record. Add it in Student Onboarding before sending a payment link.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSend} disabled={noPhone}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-40">
              💳 Create & Copy Link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
