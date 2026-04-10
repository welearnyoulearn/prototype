// WLYL Offline Attendance Service Worker
const CACHE_NAME = 'wlyl-v1'
const QUEUE_KEY  = 'attendance_queue'

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Intercept attendance POST requests when offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method === 'POST' && url.pathname === '/api/attendance') {
    e.respondWith(handleAttendancePost(e.request))
  }
})

async function handleAttendancePost(request) {
  try {
    // Try online first
    const response = await fetch(request.clone())
    return response
  } catch {
    // Offline — queue it
    const body = await request.clone().json()
    const queue = await getQueue()
    const entry = { id: Date.now(), body, status: 'pending', queued_at: new Date().toISOString() }
    queue.push(entry)
    await saveQueue(queue)

    // Notify all clients
    const clients = await self.clients.matchAll()
    clients.forEach(c => c.postMessage({ type: 'QUEUED', id: entry.id, count: queue.length }))

    return new Response(JSON.stringify({ offline: true, queued: true, id: entry.id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Sync when back online
self.addEventListener('sync', e => {
  if (e.tag === 'attendance-sync') {
    e.waitUntil(syncQueue())
  }
})

// Also try sync on fetch (for browsers without Background Sync)
self.addEventListener('fetch', e => {
  if (e.request.method === 'GET') {
    e.waitUntil(syncQueue().catch(() => {}))
  }
})

async function syncQueue() {
  const queue = await getQueue()
  if (queue.length === 0) return

  const results = []
  for (const entry of queue) {
    if (entry.status === 'synced') continue
    try {
      const r = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      })
      entry.status = r.ok ? 'synced' : 'failed'
      results.push({ id: entry.id, status: entry.status })
    } catch {
      entry.status = 'failed'
      results.push({ id: entry.id, status: 'failed' })
    }
  }

  // Remove synced entries, keep failed for retry
  const remaining = queue.filter(e => e.status !== 'synced')
  await saveQueue(remaining)

  const clients = await self.clients.matchAll()
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', results, remaining: remaining.length }))
}

async function getQueue() {
  try {
    const db   = await openDB()
    const tx   = db.transaction('queue', 'readonly')
    const all  = await tx.objectStore('queue').getAll()
    return all || []
  } catch { return [] }
}

async function saveQueue(queue) {
  const db = await openDB()
  const tx = db.transaction('queue', 'readwrite')
  const store = tx.objectStore('queue')
  await store.clear()
  for (const item of queue) await store.put(item)
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wlyl_offline', 1)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}
