// WLYL Offline Attendance Service Worker
// Registered with scope '/school-admin' (see app/school-admin/hooks/useOfflineAttendance.ts).
// Queued submissions are re-sent only on the 'sync' event, a { type: 'SYNC' } message from the
// page (when it comes back online or the user hits Retry), or on activation — never per fetch.

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim().then(() => syncQueue()).catch(() => {})))

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
    return await fetch(request.clone())
  } catch {
    // Offline — queue it
    const body = await request.clone().json()
    const entry = { id: Date.now(), body, status: 'pending', queued_at: new Date().toISOString() }
    const count = await addEntry(entry)

    // Notify all clients
    const clients = await self.clients.matchAll()
    clients.forEach(c => c.postMessage({ type: 'QUEUED', id: entry.id, count }))

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

// The page asks for a sync when it comes back online (browsers without Background Sync) or on Retry.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SYNC') {
    e.waitUntil(syncQueue().catch(() => {}))
  }
})

// One sync at a time: overlapping triggers share the in-flight run, so no entry is POSTed twice.
let syncing = null
function syncQueue() {
  if (!syncing) syncing = runSync().finally(() => { syncing = null })
  return syncing
}

async function runSync() {
  const queue = await getQueue()
  if (queue.length === 0) return

  const results = []
  const processed = []
  for (const entry of queue) {
    // 'terminal' = the server understood and REFUSED it (already marked by someone else, holiday,
    // outside the allowed dates…). Retrying can never succeed, so it is kept for the user to see
    // — with the reason — and never re-sent.
    if (entry.status === 'synced' || entry.terminal) continue
    try {
      const r = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      })
      if (r.ok) {
        entry.status = 'synced'
      } else {
        entry.status = 'failed'
        if ([400, 403, 404, 409].includes(r.status)) {
          entry.terminal = true
          const j = await r.json().catch(() => ({}))
          entry.reason = j.error || 'Rejected by the server'
        }
      }
      results.push({ id: entry.id, status: entry.status })
    } catch {
      entry.status = 'failed'
      results.push({ id: entry.id, status: 'failed' })
    }
    processed.push(entry)
  }

  // Remove synced entries, keep failed for retry. Only the entries sent in this run are written
  // (not clear + rewrite), so one queued or dismissed while the sync was running is left alone.
  const remaining = await updateEntries(processed)

  const clients = await self.clients.matchAll()
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', results, remaining }))
}

async function getQueue() {
  try {
    const db = await openDB()
    const all = await reqP(db.transaction('queue', 'readonly').objectStore('queue').getAll())
    return all || []
  } catch { return [] }
}

// Adds one entry; resolves to the queue length once the write has committed.
async function addEntry(entry) {
  const db = await openDB()
  const tx = db.transaction('queue', 'readwrite')
  const store = tx.objectStore('queue')
  store.put(entry)
  const count = reqP(store.count())
  await txDone(tx)
  return count
}

// Deletes synced entries, saves the rest; resolves to the queue length after commit.
async function updateEntries(entries) {
  const db = await openDB()
  const tx = db.transaction('queue', 'readwrite')
  const store = tx.objectStore('queue')
  for (const entry of entries) {
    if (entry.status === 'synced') store.delete(entry.id)
    else store.put(entry)
  }
  const count = reqP(store.count())
  await txDone(tx)
  return count
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror   = () => reject(request.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
    tx.onabort    = () => reject(tx.error)
  })
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
