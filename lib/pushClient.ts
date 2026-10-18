// Browser side of push notifications (Firebase Cloud Messaging for web).
//
// Flow: the user taps "Turn on notifications" in the bell -> enablePush() asks the browser for
// permission, registers public/firebase-messaging-sw.js, gets an FCM token and POSTs it to
// /api/devices. syncPushRegistration() re-sends it on later visits, and unregisterPushDevice() runs
// on logout so the next person on a shared device does not get the previous user's pushes.
//
// Everything here is best-effort and never throws: push is an extra on top of the 30-second poll,
// not something a page may depend on. The Firebase SDK is imported lazily so it stays out of the
// main bundle until someone actually enables push.

const TOKEN_KEY = 'wlyl_push_token'
const SYNCED_KEY = 'wlyl_push_synced'
// A scope of its own: /sw-attendance.js already owns "/", and a scope holds one worker.
const SW_SCOPE = '/firebase-cloud-messaging-push-scope'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export type PushState = 'unconfigured' | 'unsupported' | 'blocked' | 'off' | 'on'

export type EnablePushResult = { ok: true } | { ok: false; reason: 'unavailable' | 'blocked' | 'dismissed' | 'failed' }

function configured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey)
}

function browserSupportsPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** What the bell should offer on this device right now. */
export function getPushState(): PushState {
  if (!configured()) return 'unconfigured'
  if (!browserSupportsPush()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' ? 'on' : 'off'
}

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch { /* storage unavailable: the token is simply re-fetched next time */ }
}

async function getMessaging() {
  const [{ getApp, getApps, initializeApp }, { getMessaging: messagingFor, isSupported }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ])
  if (!(await isSupported())) return null
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  return messagingFor(app)
}

async function fetchToken(): Promise<string | null> {
  const messaging = await getMessaging()
  if (!messaging) return null
  const { getToken } = await import('firebase/messaging')
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: SW_SCOPE })
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  return token || null
}

async function registerWithServer(token: string): Promise<boolean> {
  const res = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'web' }),
  })
  return res.ok
}

/** Asks for permission (must be called from a click), then registers this browser for push. */
export async function enablePush(): Promise<EnablePushResult> {
  try {
    const state = getPushState()
    if (state === 'unconfigured' || state === 'unsupported') return { ok: false, reason: 'unavailable' }
    if (state === 'blocked') return { ok: false, reason: 'blocked' }

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') return { ok: false, reason: 'blocked' }
      if (permission !== 'granted') return { ok: false, reason: 'dismissed' }
    }

    const token = await fetchToken()
    if (!token || !(await registerWithServer(token))) return { ok: false, reason: 'failed' }
    writeStored(TOKEN_KEY, token)
    try { window.sessionStorage.setItem(SYNCED_KEY, '1') } catch { /* ignore */ }
    return { ok: true }
  } catch (error) {
    console.error('[push] enable failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * For a device that already allowed notifications: re-sends its token so the server knows who is
 * signed in on it now (and refreshes a rotated token). At most once per browser session.
 */
export async function syncPushRegistration(): Promise<void> {
  try {
    if (getPushState() !== 'on') return
    if (window.sessionStorage.getItem(SYNCED_KEY)) return
    const token = await fetchToken()
    if (!token) return
    if (await registerWithServer(token)) {
      writeStored(TOKEN_KEY, token)
      window.sessionStorage.setItem(SYNCED_KEY, '1')
    }
  } catch (error) {
    console.error('[push] sync failed', error)
  }
}

async function unregister(): Promise<void> {
  const token = readStored(TOKEN_KEY)
  if (!token) return
  // Remove it from the server first: that call needs the session cookie, which logout is about to clear.
  await fetch('/api/devices', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => undefined)
  try {
    const messaging = await getMessaging()
    if (messaging) {
      const { deleteToken } = await import('firebase/messaging')
      await deleteToken(messaging)
    }
  } catch { /* the server already forgot it; FCM expires unused tokens on its own */ }
  writeStored(TOKEN_KEY, null)
  try { window.sessionStorage.removeItem(SYNCED_KEY) } catch { /* ignore */ }
}

/** Call right before logging out. Never throws and never holds logout up for more than a few seconds. */
export async function unregisterPushDevice(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !readStored(TOKEN_KEY)) return
    await Promise.race([unregister(), new Promise<void>(resolve => setTimeout(resolve, 4000))])
  } catch { /* logout must go ahead regardless */ }
}
