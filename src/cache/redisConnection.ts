/**
 * Redis Connection Manager - ULTRATHINK
 * Singleton pattern to prevent multiple connection attempts
 */

import Redis from 'ioredis';

class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private client: Redis | null = null;
  private connectionPromise: Promise<Redis> | null = null;
  private isConnecting = false;
  private isConnected = false;

  private constructor() {}

  static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  async getClient(): Promise<Redis> {
    // If already connected, return the client
    if (this.isConnected && this.client) {
      return this.client;
    }

    // If currently connecting, wait for the connection
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this.connect();
    
    try {
      const client = await this.connectionPromise;
      this.isConnected = true;
      this.isConnecting = false;
      return client;
    } catch (error) {
      this.isConnecting = false;
      this.connectionPromise = null;
      throw error;
    }
  }

  private async connect(): Promise<Redis> {
    const REDIS_URL = process.env.REDIS_URL || 'redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379';
    
    console.log('🔄 Connecting to Redis:', REDIS_URL.replace(/\/\/.*@/, '//***@'));
    
    this.client = new Redis(REDIS_URL, {
      lazyConnect: false, // Connect immediately
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error('❌ Redis connection failed after 10 retries');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        console.log(`⏳ Redis retry ${times} in ${delay}ms`);
        return delay;
      },
      connectTimeout: 10000,
      commandTimeout: 5000,
      enableOfflineQueue: true,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      }
    });

    // Set up event handlers
    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('🚀 Redis ready for commands');
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
      // Don't set isConnected to false here, as Redis might recover
    });

    this.client.on('close', () => {
      console.log('🔌 Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    // Wait for ready event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout after 10s'));
      }, 10000);

      this.client!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null && this.client.status === 'ready';
  }

  // Get client without connecting (for health checks)
  getClientIfReady(): Redis | null {
    return this.isReady() ? this.client : null;
  }
}

// Export singleton instance
export const redisManager = RedisConnectionManager.getInstance();

// Helper function for Lambda handlers
export async function getRedisClient(): Promise<Redis | null> {
  try {
    return await redisManager.getClient();
  } catch (error) {
    console.error('Failed to get Redis client:', error);
    return null;
  }
}

// Check if Redis is available (for health checks)
export function isRedisReady(): boolean {
  return redisManager.isReady();
}

// Graceful shutdown for Lambda
export async function closeRedisConnection(): Promise<void> {
  await redisManager.disconnect();
}