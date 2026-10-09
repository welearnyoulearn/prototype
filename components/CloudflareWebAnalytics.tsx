import Script from 'next/script'

// Cookieless visitor counts for public pages only (never the portals). Off unless the token is set.
export default function CloudflareWebAnalytics() {
  const token = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN
  if (!token) return null
  return (
    <Script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
      strategy="afterInteractive"
    />
  )
}
