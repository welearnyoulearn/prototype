'use client'

import { useEffect, useState, useCallback } from 'react'

export type QueueEntry = {
  id: number
  body: Record<string, unknown>
  status: 'pending' | 'synced' | 'failed'
  queued_at: string
}

export type SyncResult = { id: number; status: string }

export function useOfflineAttendance() {
  const [isOnline, setIsOnline]   = useState(true)
  const [queue, setQueue]         = useState<QueueEntry[]>([])
  const [swReady, setSwReady]     = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[]>([])

  // Register service worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw-attendance.js')
      .then(() => setSwReady(true))
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

  async function triggerSync() {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      if ('sync' in reg) {
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('attendance-sync')
      }
    } catch { /* Background Sync not supported, SW will sync on next fetch */ }
  }

  async function retryFailed() {
    const failed = queue.filter(q => q.status === 'failed')
    for (const entry of failed) {
      try {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.body),
        })
      } catch { /* still offline */ }
    }
    await loadQueue()
  }

  return { isOnline, queue, swReady, syncResults, loadQueue, retryFailed }
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
