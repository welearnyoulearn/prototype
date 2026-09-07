'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { useFeedbackFetch } from './useFeedbackFetch'

interface Rating { category_key: string; category_label: string; rating: number; priority: string | null; status: string }
interface Submission {
  id: number
  role: string
  is_anonymous: boolean
  submitter_name: string | null
  submitter_phone: string | null
  quick_pick_tags: string | null
  free_text: string | null
  has_voice: boolean
  created_at: string
  ratings: Rating[]
}
interface SubmissionsResponse { data: Submission[]; total: number }

const ROLE_OPTIONS = [{ value: 'all', label: 'All roles' }, ...FEEDBACK_ROLES.map(r => ({ value: r.key, label: r.label }))]

const RATING_EMOJI: Record<number, string> = { 1: '😭', 2: '😞', 3: '😐', 4: '😊', 5: '🤩' }

export default function FeedbackSubmissionsTab({ schoolId }: { schoolId: number }) {
  const [role, setRole] = useState('all')
  const [selected, setSelected] = useState<Submission | null>(null)

  const roleParam = role !== 'all' ? `&role=${role}` : ''
  const { data: response, loading } = useFeedbackFetch<SubmissionsResponse>(
    `/api/feedback/submissions?school_id=${schoolId}${roleParam}&limit=100`, [schoolId, role], 'Failed to load submissions'
  )
  const submissions = response?.data ?? []

  return (
    <div data-testid="feedback-submissions-tab">
      <div className="mb-4 flex items-center gap-3">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" data-testid="feedback-submissions-role-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : submissions.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">No feedback submitted yet.</div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {submissions.map(sub => (
            <button
              key={sub.id}
              type="button"
              data-testid={`feedback-submission-row-${sub.id}`}
              onClick={() => setSelected(sub)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="font-semibold capitalize text-gray-600">{sub.is_anonymous ? 'Anonymous' : (sub.submitter_name || 'Anonymous')}</span>
                  <span>· {sub.role}</span>
                  <span>· {new Date(sub.created_at).toLocaleString()}</span>
                  {sub.has_voice && <span>🎙️</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {sub.ratings.map(r => (
                    <span key={r.category_key} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-xs text-gray-700">
                      {RATING_EMOJI[r.rating]} {r.category_label}
                    </span>
                  ))}
                </div>
                {sub.free_text && <p className="mt-1 line-clamp-1 text-xs text-gray-500">{sub.free_text}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-h-[80vh] overflow-auto" data-testid="feedback-submission-detail">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.is_anonymous ? 'Anonymous submission' : (selected.submitter_name || 'Anonymous')}</DialogTitle>
              </DialogHeader>
              <p className="-mt-2 text-xs text-gray-400">{selected.role} · {new Date(selected.created_at).toLocaleString()}</p>
              {!selected.is_anonymous && selected.submitter_phone && <p className="text-xs text-gray-500">📞 {selected.submitter_phone}</p>}

              <div className="space-y-1.5">
                {selected.ratings.map(r => (
                  <div key={r.category_key} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{r.category_label}</span>
                    <span className="flex items-center gap-2">
                      <span>{RATING_EMOJI[r.rating]}</span>
                      {r.priority && <Badge variant={r.priority === 'high' ? 'destructive' : 'secondary'}>{r.priority}</Badge>}
                    </span>
                  </div>
                ))}
              </div>

              {selected.quick_pick_tags && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.quick_pick_tags.split(',').map(tag => (
                    <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
                  ))}
                </div>
              )}

              {selected.free_text && <p className="rounded-lg bg-gray-50 p-2.5 text-sm text-gray-700">{selected.free_text}</p>}

              {selected.has_voice && (
                <audio data-testid="feedback-admin-voice-player" controls src={`/api/feedback/voice/${selected.id}`} className="w-full" />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
