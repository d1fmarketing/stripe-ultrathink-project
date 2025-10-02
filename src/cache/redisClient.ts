/**
 * Redis Client Integration for ULTRATHINK
 * High-performance caching for 90%+ win rate
 */

import Redis from 'ioredis';
import { createClient } from 'redis';

// Redis configuration with fallback to known endpoint
const REDIS_URL = process.env.REDIS_URL || 'redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379';
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000
};

// Create Redis client with ioredis for better performance
// Parse Redis URL if provided
let redisOptions: any = {
  ...REDIS_CONFIG,
  lazyConnect: true,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect when Redis is in readonly mode
      return true;
    }
    return false;
  }
};

// If REDIS_URL is provided, use it directly
if (process.env.REDIS_URL || REDIS_URL) {
  const url = process.env.REDIS_URL || REDIS_URL;
  console.log('Connecting to Redis URL:', url.replace(/\/\/.*@/, '//***@'));
  redisOptions = url;
}

export const redis = new Redis(redisOptions);

// Alternative client for RedisJSON, RedisSearch, RedisTimeSeries
export const redisClient = createClient({
  url: process.env.REDIS_URL || REDIS_URL || `redis://${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`,
  password: REDIS_CONFIG.password,
  database: REDIS_CONFIG.db
});

// Connection handlers
redis.on('connect', () => {
  console.log('✅ Redis connected (ioredis)');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

redis.on('ready', () => {
  console.log('🚀 Redis ready for commands');
});

// Helper functions for common operations
export class RedisCache {
  private static instance: RedisCache;
  private constructor() {}
  
  static getInstance(): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache();
    }
    return RedisCache.instance;
  }
  
  /**
   * Set value with TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  }
  
  /**
   * Get value and parse JSON
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
  
  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    return await redis.incr(key);
  }
  
  /**
   * Add to sorted set (for rankings)
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return await redis.zadd(key, score, member);
  }
  
  /**
   * Get top N from sorted set
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await redis.zrevrange(key, start, stop);
  }
  
  /**
   * Remove members from sorted set
   */
  async zrem(key: string, ...members: string[]): Promise<number> {
    return await redis.zrem(key, ...members);
  }
  
  
  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return await redis.hset(key, field, value);
  }
  
  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return await redis.hgetall(key);
  }
  
  /**
   * Add to stream (for event tracking)
   */
  async xadd(key: string, data: Record<string, any>): Promise<string> {
    const fields: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      fields.push(k, String(v));
    }
    const result = await redis.xadd(key, '*', ...fields);
    return result || '';
  }
  
  /**
   * Read from stream
   */
  async xread(key: string, lastId: string = '0', count: number = 100): Promise<any> {
    return await redis.xread('COUNT', count, 'STREAMS', key, lastId);
  }
  
  /**
   * Pipeline for batch operations
   */
  async pipeline(commands: Array<[string, ...any[]]>): Promise<any[]> {
    const pipeline = redis.pipeline();
    for (const cmd of commands) {
      (pipeline as any)[cmd[0]](...cmd.slice(1));
    }
    const results = await pipeline.exec();
    return results ? results.map(r => r[1]) : [];
  }
  
  /**
   * Delete keys
   */
  async del(...keys: string[]): Promise<number> {
    return await redis.del(...keys);
  }
  
  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  }
  
  /**
   * Set expiry on key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await redis.expire(key, seconds);
    return result === 1;
  }
  
  /**
   * Get TTL of key
   */
  async ttl(key: string): Promise<number> {
    return await redis.ttl(key);
  }
}

// Export singleton instance
export const cache = RedisCache.getInstance();

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  await redisClient.quit();
  process.exit(0);
});

export default redis;