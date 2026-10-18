'use client'

import { useEffect, useState, useCallback } from 'react'

export type QueueEntry = {
  id: number
  body: Record<string, unknown>
  status: 'pending' | 'synced' | 'failed'
  queued_at: string
  /** The server refused this submission for good (already marked, holiday, …) — retrying is pointless. */
  terminal?: boolean
  reason?: string
}

export type SyncResult = { id: number; status: string }

export function useOfflineAttendance() {
  const [isOnline, setIsOnline]   = useState(true)
  const [queue, setQueue]         = useState<QueueEntry[]>([])
  const [swReady, setSwReady]     = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[]>([])

  // Register service worker. Scope is narrowed to the school-admin portal (allowed without a
  // Service-Worker-Allowed header: '/school-admin' sits under the script's own path, '/').
  // An older build registered it with scope '/', which intercepted requests site-wide — remove it.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration('/')
      .then(old => { if (old?.scope === `${location.origin}/`) return old.unregister() })
      .catch(() => {})
    navigator.serviceWorker.register('/sw-attendance.js', { scope: '/school-admin' })
      // Flush anything queued in an earlier visit (a fresh install syncs on activation instead).
      .then(reg => { setSwReady(true); if (navigator.onLine) reg.active?.postMessage({ type: 'SYNC' }) })
      .catch(e => console.warn('SW registration failed:', e))
  }, [])

  // Online/offline listener
  useEffect(() => {
    function onOnline()  { setIsOnline(true);  triggerSync() }
    function onOffline() { setIsOnline(false) }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for SW messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMessage(e: MessageEvent) {
      if (e.data.type === 'QUEUED') {
        loadQueue()
      }
      if (e.data.type === 'SYNC_COMPLETE') {
        setSyncResults(e.data.results || [])
        loadQueue()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadQueue = useCallback(async () => {
    try {
      const db    = await openDB()
      const tx    = db.transaction('queue', 'readonly')
      const items = await promisify<QueueEntry[]>(tx.objectStore('queue').getAll())
      setQueue(items || [])
    } catch { setQueue([]) }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  // The SW is the only sender of queued entries (it guards against overlapping runs), so the page
  // just asks it to sync; SYNC_COMPLETE then reloads the queue.
  async function triggerSync() {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      if ('sync' in reg) {
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('attendance-sync')
      } else {
        reg.active?.postMessage({ type: 'SYNC' })
      }
    } catch { /* SW unavailable — it syncs on its next activation */ }
  }

  async function retryFailed() {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      reg.active?.postMessage({ type: 'SYNC' })
    } catch { /* SW unavailable */ }
  }

  // Clears submissions the server refused, once the user has read why.
  async function dismissRejected() {
    try {
      const db = await openDB()
      const tx = db.transaction('queue', 'readwrite')
      const store = tx.objectStore('queue')
      for (const q of queue.filter(e => e.terminal)) store.delete(q.id)
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    } catch { /* nothing to clear */ }
    await loadQueue()
  }

  return { isOnline, queue, swReady, syncResults, loadQueue, retryFailed, dismissRejected }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wlyl_offline', 1)
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' })
      }
    }
    req.onsuccess = (e: Event) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = (e: Event) => reject((e.target as IDBOpenDBRequest).error)
  })
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror   = () => reject(request.error)
  })
}
