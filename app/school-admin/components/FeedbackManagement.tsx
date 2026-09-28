'use client'

import { Fragment, useState } from 'react'
import { Filter, Inbox, LayoutDashboard, QrCode, Settings, Siren, Tags, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QR_POINT_KINDS } from '@/lib/feedback-defaults'
import FeedbackDashboardTab from './feedback/FeedbackDashboardTab'
import FeedbackSubmissionsTab from './feedback/FeedbackSubmissionsTab'
import FeedbackIssueTable from './feedback/FeedbackIssueTable'
import FeedbackCategoryEditor from './feedback/FeedbackCategoryEditor'
import FeedbackQrPoster from './feedback/FeedbackQrPoster'
import FeedbackQrPointsTab, { QrPoint } from './feedback/FeedbackQrPointsTab'
import { useFeedbackFetch } from './feedback/useFeedbackFetch'

// Tabs whose data can be narrowed to one feedback source (see lib/feedback-source.ts).
// Submissions uses folders (one per source) instead of this dropdown.
const SOURCE_TABS = new Set(['dashboard', 'issues'])

type TabKey = 'dashboard' | 'submissions' | 'issues' | 'qr-points' | 'categories' | 'settings'
type BadgeKey = 'submissions' | 'issues' | 'qrs'

// Two groups: reading feedback (Insights) vs configuring how it's collected (Setup)
const TAB_GROUPS: { label: string; tabs: { key: TabKey; label: string; Icon: typeof Inbox; badge?: BadgeKey }[] }[] = [
  {
    label: 'Insights',
    tabs: [
      { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { key: 'submissions', label: 'Submissions', Icon: Inbox, badge: 'submissions' },
      { key: 'issues', label: 'Issue Pipeline', Icon: Siren, badge: 'issues' },
    ],
  },
  {
    label: 'Setup',
    tabs: [
      { key: 'qr-points', label: 'Event & Place QRs', Icon: QrCode, badge: 'qrs' },
      { key: 'categories', label: 'Categories', Icon: Tags },
      { key: 'settings', label: 'Settings & QR', Icon: Settings },
    ],
  },
]

// Brand-green active pill; overrides the shadcn defaults via tailwind-merge
const TRIGGER_CLS =
  'group h-9 flex-none gap-2 rounded-lg px-3.5 text-sm font-semibold text-gray-600 transition-colors ' +
  'hover:bg-[#edf2eb] hover:text-[#245b46] ' +
  'focus-visible:ring-2 focus-visible:ring-[#245b46]/40 ' +
  'data-[state=active]:bg-[#245b46] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:bg-[#245b46]'

export default function FeedbackManagement({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<string>('dashboard')
  // 'all' | 'general' (school-wide QR) | '<qr point id>'
  const [source, setSource] = useState('all')
  const { data: points, loading: pointsLoading, error: pointsError, reload: reloadPoints } = useFeedbackFetch<QrPoint[]>(
    // Re-fetched on every tab switch so QR cards and folder counts (responses,
    // open issues) catch up with changes made in other tabs.
    `/api/feedback/qr-points?school_id=${schoolId}`, [schoolId, tab], 'Failed to load QR codes'
  )
  // Dashboard/Issues only ever filter by live sources: the Archive is a
  // Submissions-only folder, and a QR point deleted elsewhere must not stay
  // selected as a filter that no longer exists.
  const pointExists = !/^\d+$/.test(source) || !points || points.some(p => String(p.id) === source)
  const liveSource = source === 'archived' || !pointExists ? 'all' : source

  // Tab badges — re-fetched whenever the tab changes, so they catch up after
  // issues are resolved or folders cleared elsewhere on the page.
  const { data: liveTotal } = useFeedbackFetch<{ total: number }>(
    `/api/feedback/submissions?school_id=${schoolId}&source=all&limit=1`, [schoolId, tab], 'Failed'
  )
  const { data: openIssues } = useFeedbackFetch<unknown[]>(
    `/api/feedback/issues?school_id=${schoolId}&status=open`, [schoolId, tab], 'Failed'
  )
  const badges: Record<BadgeKey, { value: number; alert?: boolean } | null> = {
    submissions: liveTotal ? { value: liveTotal.total } : null,
    issues: openIssues ? { value: openIssues.length, alert: openIssues.length > 0 } : null,
    qrs: points ? { value: points.length } : null,
  }
  const filtered = liveSource !== 'all'

  function viewPointResponses(pointId: number) {
    setSource(String(pointId))
    setTab('submissions')
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Feedback Management</h1>
        <p className="text-sm text-gray-500 mt-1">Collect and act on feedback from parents, students, teachers, and visitors.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {/* Scrolls sideways on narrow screens instead of squashing the labels */}
          <div className="-mx-1 max-w-full overflow-x-auto overflow-y-hidden px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList
              data-testid="feedback-admin-tabs"
              className="h-auto gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm group-data-[orientation=horizontal]/tabs:h-auto"
            >
              {TAB_GROUPS.map((group, gi) => (
                <Fragment key={group.label}>
                  {gi > 0 && <span className="mx-1.5 h-6 w-px shrink-0 bg-gray-200" aria-hidden="true" />}
                  <span className="hidden px-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 xl:inline" aria-hidden="true">{group.label}</span>
                  {group.tabs.map(({ key, label, Icon, badge }) => {
                    const b = badge ? badges[badge] : null
                    return (
                      <TabsTrigger key={key} value={key} data-testid={`feedback-tab-${key}`} className={TRIGGER_CLS}>
                        <Icon size={16} aria-hidden="true" className="opacity-80 group-data-[state=active]:opacity-100" />
                        {label}
                        {b && b.value > 0 && (
                          <span
                            className={`min-w-[20px] rounded-full px-1.5 py-px text-center text-[11px] font-bold leading-4 ${
                              b.alert
                                ? 'bg-rose-500 text-white'
                                : 'bg-gray-100 text-gray-600 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white'
                            }`}
                            aria-label={badge === 'issues' ? `${b.value} open issues` : undefined}
                          >
                            {b.value > 99 ? '99+' : b.value}
                          </span>
                        )}
                      </TabsTrigger>
                    )
                  })}
                </Fragment>
              ))}
            </TabsList>
          </div>

          {SOURCE_TABS.has(tab) && (
            <div className="flex items-center gap-1.5">
              <Select value={liveSource} onValueChange={setSource}>
                <SelectTrigger
                  className={`h-11 w-72 rounded-xl bg-white shadow-sm ${filtered ? 'border-[#245b46] ring-2 ring-[#245b46]/15' : 'border-gray-200'}`}
                  data-testid="feedback-source-filter"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Filter size={15} className={filtered ? 'text-[#245b46]' : 'text-gray-400'} aria-hidden="true" />
                    <span className="text-xs font-semibold text-gray-400">Showing:</span>
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-800"><SelectValue /></span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All feedback</SelectItem>
                  <SelectItem value="general">🏫 School-wide QR only</SelectItem>
                  {(points ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {QR_POINT_KINDS.find(k => k.key === p.kind)?.icon} {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtered && (
                <button
                  type="button"
                  onClick={() => setSource('all')}
                  title="Show all feedback"
                  aria-label="Clear filter"
                  data-testid="feedback-source-clear"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        <TabsContent value="dashboard"><FeedbackDashboardTab schoolId={schoolId} source={liveSource} onNavigate={setTab} /></TabsContent>
        <TabsContent value="submissions">
          <FeedbackSubmissionsTab schoolId={schoolId} source={source} points={points ?? []} onSourceChange={setSource} onPointsChanged={reloadPoints} />
        </TabsContent>
        <TabsContent value="issues"><FeedbackIssueTable schoolId={schoolId} source={liveSource} /></TabsContent>
        <TabsContent value="qr-points">
          <FeedbackQrPointsTab
            schoolId={schoolId}
            points={points ?? []}
            loading={pointsLoading}
            error={pointsError}
            reload={reloadPoints}
            onViewResponses={viewPointResponses}
          />
        </TabsContent>
        <TabsContent value="categories"><FeedbackCategoryEditor schoolId={schoolId} points={points ?? []} /></TabsContent>
        <TabsContent value="settings"><FeedbackQrPoster schoolId={schoolId} /></TabsContent>
      </Tabs>
    </div>
  )
}
