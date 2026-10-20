// WLYL push-notification service worker (Firebase Cloud Messaging for web).
//
// Registered by lib/pushClient.ts under its own scope (/firebase-cloud-messaging-push-scope) because
// /sw-attendance.js already owns "/". It deliberately does not load the Firebase SDK: FCM hands the
// browser a plain Web Push message ({ notification, data }), so all that is needed is to show it.
//
// If a window of the app is open and visible the message is handed to the page instead (the bell
// refreshes itself), so people are not buzzed about something already on their screen.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

function parsePayload(event) {
  try { return event.data ? event.data.json() : {} } catch { return {} }
}

self.addEventListener('push', event => {
  const payload = parsePayload(event)
  const notification = payload.notification || {}
  const data = payload.data || {}

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visible = windows.filter(w => w.visibilityState === 'visible')
    if (visible.length > 0) {
      visible.forEach(w => w.postMessage({ type: 'wlyl-push', data }))
      return
    }
    await self.registration.showNotification(notification.title || 'WeLearnYouLearn', {
      body: notification.body || '',
      // One tag per notification: a re-delivered push replaces itself instead of stacking.
      tag: data.notification_id ? 'wlyl-' + data.notification_id : undefined,
      data,
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows[0]
    if (existing) {
      await existing.focus()
      return
    }
    await self.clients.openWindow(target)
  })())
})
