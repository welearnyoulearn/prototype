'use client'

import { useState } from 'react'
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

export default function FeedbackManagement({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState('dashboard')
  // 'all' | 'general' (school-wide QR) | '<qr point id>'
  const [source, setSource] = useState('all')
  // The Archive is a Submissions-only folder; Dashboard/Issues show live feedback
  const liveSource = source === 'archived' ? 'all' : source
  const { data: points, loading: pointsLoading, error: pointsError, reload: reloadPoints } = useFeedbackFetch<QrPoint[]>(
    `/api/feedback/qr-points?school_id=${schoolId}`, [schoolId], 'Failed to load QR codes'
  )

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList data-testid="feedback-admin-tabs">
            <TabsTrigger value="dashboard" data-testid="feedback-tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="submissions" data-testid="feedback-tab-submissions">Submissions</TabsTrigger>
            <TabsTrigger value="issues" data-testid="feedback-tab-issues">Issue Pipeline</TabsTrigger>
            <TabsTrigger value="qr-points" data-testid="feedback-tab-qr-points">Event &amp; Place QRs</TabsTrigger>
            <TabsTrigger value="categories" data-testid="feedback-tab-categories">Categories</TabsTrigger>
            <TabsTrigger value="settings" data-testid="feedback-tab-settings">Settings &amp; QR</TabsTrigger>
          </TabsList>

          {SOURCE_TABS.has(tab) && (
            <Select value={liveSource} onValueChange={setSource}>
              <SelectTrigger className="w-64" data-testid="feedback-source-filter"><SelectValue /></SelectTrigger>
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
        <TabsContent value="categories"><FeedbackCategoryEditor schoolId={schoolId} /></TabsContent>
        <TabsContent value="settings"><FeedbackQrPoster schoolId={schoolId} /></TabsContent>
      </Tabs>
    </div>
  )
}
