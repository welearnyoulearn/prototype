/**
 * Server-side in-memory response cache.
 * Lives in the Node.js process — survives across requests on warm instances,
 * including Vercel warm lambdas and the local dev server.
 * TTL defaults: stable data (classes, teachers) = 60s, hot data (health) = 20s.
 */

type CacheEntry = { data: unknown; expires: number }

const cache = new Map<string, CacheEntry>()

export function getCache(key: string): unknown | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCache(key: string, data: unknown, ttlMs = 60_000): void {
  cache.set(key, { data, expires: Date.now() + ttlMs })
}

/**
 * Invalidate all cache keys that contain the given substring.
 * Call this on any POST/PUT/DELETE that mutates a cached resource.
 *
 * Usage:
 *   invalidateCache(`classes:${school_id}`)   // exact match
 *   invalidateCache(`school:${school_id}`)     // clears all keys with this prefix
 */
export function invalidateCache(pattern: string): void {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key)
  }
}
