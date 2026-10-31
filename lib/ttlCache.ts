// A tiny per-instance cache with a time limit, for values read on every request but rarely changed (quiz
// settings, holidays, feature switches). Each serverless instance keeps its own copy, so a change shows up
// everywhere within `ttlMs`; the instance that made the change can drop the key at once with forget().
// Callers asking for the same key while it loads share one load (no stampede when an instance starts cold).

type Entry = { value: Promise<unknown>; expires: number }
const store = new Map<string, Entry>()
const MAX_ENTRIES = 5_000

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expires > now) return hit.value as Promise<T>
  if (store.size >= MAX_ENTRIES) store.clear()
  const value = load()
  store.set(key, { value, expires: now + ttlMs })
  // A failed load is not kept: the next caller tries again.
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key) })
  return value
}

/** Drops one key, or every key starting with `prefix*`. */
export function forget(key: string): void {
  if (key.endsWith('*')) {
    const prefix = key.slice(0, -1)
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
  } else {
    store.delete(key)
  }
}
