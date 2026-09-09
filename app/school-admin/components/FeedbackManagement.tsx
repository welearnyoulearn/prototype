'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import FeedbackDashboardTab from './feedback/FeedbackDashboardTab'
import FeedbackSubmissionsTab from './feedback/FeedbackSubmissionsTab'
import FeedbackIssueTable from './feedback/FeedbackIssueTable'
import FeedbackCategoryEditor from './feedback/FeedbackCategoryEditor'
import FeedbackQrPoster from './feedback/FeedbackQrPoster'

export default function FeedbackManagement({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Feedback Management</h1>
        <p className="text-sm text-gray-500 mt-1">Collect and act on feedback from parents, students, teachers, and visitors.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="feedback-admin-tabs">
          <TabsTrigger value="dashboard" data-testid="feedback-tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="submissions" data-testid="feedback-tab-submissions">Submissions</TabsTrigger>
          <TabsTrigger value="issues" data-testid="feedback-tab-issues">Issue Pipeline</TabsTrigger>
          <TabsTrigger value="categories" data-testid="feedback-tab-categories">Categories</TabsTrigger>
          <TabsTrigger value="settings" data-testid="feedback-tab-settings">Settings & QR</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><FeedbackDashboardTab schoolId={schoolId} /></TabsContent>
        <TabsContent value="submissions"><FeedbackSubmissionsTab schoolId={schoolId} /></TabsContent>
        <TabsContent value="issues"><FeedbackIssueTable schoolId={schoolId} /></TabsContent>
        <TabsContent value="categories"><FeedbackCategoryEditor schoolId={schoolId} /></TabsContent>
        <TabsContent value="settings"><FeedbackQrPoster schoolId={schoolId} /></TabsContent>
      </Tabs>
    </div>
  )
}
