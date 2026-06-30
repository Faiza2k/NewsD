// Server-side caching layer with TTL and LRU eviction

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 200;

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  // LRU eviction if over limit
  if (cache.size >= MAX_ENTRIES) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, Math.floor(MAX_ENTRIES / 4));
    for (const [k] of toRemove) {
      cache.delete(k);
    }
  }

  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

export function invalidateCache(keyPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxEntries: MAX_ENTRIES,
    keys: Array.from(cache.keys()),
  };
}
