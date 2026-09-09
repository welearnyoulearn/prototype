import FeedbackWizard from './FeedbackWizard'

// Public, unauthenticated route — reached by scanning a school's feedback QR
// poster. No server-side data fetching here on purpose: a bad/expired code
// and a good one should look identical at the routing layer, so the
// distinction is made client-side by GET /api/feedback/resolve.
export default async function FeedbackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <FeedbackWizard code={code} />
}
