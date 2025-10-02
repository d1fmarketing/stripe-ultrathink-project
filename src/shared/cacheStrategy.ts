import { cache as redisCache } from '../cache/redisClient.js';

export type CacheSource = 'memory' | 'redis' | 'origin';

export interface CacheOptions {
  /** TTL for in-memory cache in seconds */
  memoryTTL?: number;
  /** TTL for Redis cache in seconds */
  redisTTL?: number;
  /** Allow stale-while-revalidate responses from memory */
  staleWhileRevalidate?: boolean;
  /** Additional stale lifetime (seconds) when stale-while-revalidate is enabled */
  staleTTL?: number;
  /** Optional tags for invalidation */
  tags?: string[];
  /** Skip Redis caching (useful for local development) */
  disableRedis?: boolean;
}

interface InternalCacheOptions {
  memoryTTL: number;
  redisTTL: number;
  staleWhileRevalidate: boolean;
  staleTTL: number;
  tags: string[];
  disableRedis: boolean;
}

interface MemoryEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
  revalidating: boolean;
  tags: string[];
}

export interface CacheMetadata {
  source: CacheSource;
  hit: boolean;
  stale: boolean;
}

export interface CacheResult<T> {
  value: T;
  metadata: CacheMetadata;
}

const hasStructuredClone = typeof globalThis.structuredClone === 'function';

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  try {
    if (hasStructuredClone) {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export class TieredCacheStrategy {
  private readonly memoryCache = new Map<string, MemoryEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly defaults: InternalCacheOptions;

  constructor(defaults?: CacheOptions) {
    this.defaults = this.resolveOptions(defaults);
  }

  buildKey(namespace: string, ...parts: Array<string | number | boolean | null | undefined>): string {
    const sanitized = parts
      .filter((part) => part !== undefined && part !== null && part !== '')
      .map((part) => String(part).trim().replace(/\s+/g, '_'));
    return [namespace, ...sanitized].join(':');
  }

  async wrap<T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions): Promise<CacheResult<T>> {
    const resolved = this.resolveOptions(options);
    const cached = await this.getFromCache<T>(key, resolved);

    if (cached) {
      const { entry, source, stale } = cached;

      if (stale && resolved.staleWhileRevalidate) {
        this.triggerRevalidation(key, fetcher, resolved, entry).catch((error) => {
          console.warn(`[CACHE] Revalidation failed for ${key}:`, error);
        });
      }

      return {
        value: cloneValue(entry.value as T),
        metadata: {
          source,
          hit: true,
          stale
        }
      };
    }

    const value = await fetcher();
    await this.set(key, value, resolved);

    return {
      value: cloneValue(value),
      metadata: {
        source: 'origin',
        hit: false,
        stale: false
      }
    };
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const resolved = this.resolveOptions(options);
    this.setMemoryEntry(key, value, resolved);

    if (resolved.disableRedis) {
      return;
    }

    try {
      await redisCache.set(key, value, resolved.redisTTL);
      console.log(`[CACHE] Stored key ${key} in Redis (${resolved.redisTTL}s)`);
    } catch (error) {
      console.warn(`[CACHE] Redis set failed for key ${key}:`, error);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    for (const tagSet of this.tagIndex.values()) {
      tagSet.delete(key);
    }

    try {
      await redisCache.del(key);
    } catch (error) {
      console.warn(`[CACHE] Redis delete failed for key ${key}:`, error);
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;

    const deletions: Promise<void>[] = [];
    for (const key of keys) {
      this.memoryCache.delete(key);
      deletions.push(
        redisCache
          .del(key)
          .then(() => {})
          .catch((error) => {
            console.warn(`[CACHE] Redis delete failed for key ${key}:`, error);
          })
      );
    }

    this.tagIndex.delete(tag);
    await Promise.allSettled(deletions);
  }

  private resolveOptions(options?: CacheOptions): InternalCacheOptions {
    const merged = {
      memoryTTL: options?.memoryTTL ?? this.defaults.memoryTTL ?? 30,
      redisTTL: options?.redisTTL ?? this.defaults.redisTTL ?? 120,
      staleWhileRevalidate: options?.staleWhileRevalidate ?? this.defaults.staleWhileRevalidate ?? false,
      staleTTL: options?.staleTTL ?? this.defaults.staleTTL ?? 0,
      tags: options?.tags ?? this.defaults.tags ?? [],
      disableRedis: options?.disableRedis ?? this.defaults.disableRedis ?? false
    } satisfies InternalCacheOptions;

    return merged;
  }

  private async getFromCache<T>(key: string, options: InternalCacheOptions): Promise<{
    entry: MemoryEntry<T>;
    source: CacheSource;
    stale: boolean;
  } | null> {
    const now = Date.now();
    const memoryEntry = this.memoryCache.get(key) as MemoryEntry<T> | undefined;

    if (memoryEntry) {
      if (memoryEntry.expiresAt > now) {
        console.log(`[CACHE] Memory hit for ${key}`);
        return { entry: memoryEntry, source: 'memory', stale: false };
      }

      if (options.staleWhileRevalidate && memoryEntry.staleUntil > now) {
        console.log(`[CACHE] Memory stale hit for ${key}`);
        return { entry: memoryEntry, source: 'memory', stale: true };
      }

      this.memoryCache.delete(key);
    }

    if (options.disableRedis) {
      return null;
    }

    try {
      const value = await redisCache.get<T>(key);
      if (value !== null && value !== undefined) {
        console.log(`[CACHE] Redis hit for ${key}`);
        this.setMemoryEntry(key, value, options);
        const entry = this.memoryCache.get(key) as MemoryEntry<T>;
        return { entry, source: 'redis', stale: false };
      }
    } catch (error) {
      console.warn(`[CACHE] Redis get failed for key ${key}:`, error);
    }

    return null;
  }

  private setMemoryEntry<T>(key: string, value: T, options: InternalCacheOptions): void {
    const now = Date.now();
    const expiresAt = now + options.memoryTTL * 1000;
    const staleUntil = options.staleWhileRevalidate ? expiresAt + options.staleTTL * 1000 : expiresAt;

    const entry: MemoryEntry<T> = {
      value,
      expiresAt,
      staleUntil,
      revalidating: false,
      tags: options.tags
    };

    this.memoryCache.set(key, entry);
    this.indexTags(key, options.tags);
  }

  private indexTags(key: string, tags: string[]): void {
    tags.forEach((tag) => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    });
  }

  private async triggerRevalidation<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: InternalCacheOptions,
    entry: MemoryEntry<unknown>
  ): Promise<void> {
    if (entry.revalidating) {
      return;
    }

    entry.revalidating = true;
    try {
      const value = await fetcher();
      await this.set(key, value, options);
    } finally {
      entry.revalidating = false;
    }
  }
}

export const cachingStrategy = new TieredCacheStrategy({
  memoryTTL: 30,
  redisTTL: 120,
  staleWhileRevalidate: true,
  staleTTL: 60,
  disableRedis: !process.env.REDIS_URL && process.env.NODE_ENV === 'development'
});
