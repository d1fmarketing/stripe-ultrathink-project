import Redis from 'ioredis';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withErrorHandling } from '../shared/errorHandling.js';

/**
 * Debug endpoint to test Redis connectivity
 * Helps diagnose Redis connection issues
 */
async function baseHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Connect to Redis
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000
    });
    
    // Time the ping
    const t0 = Date.now();
    await redis.connect();
    const pong = await redis.ping();
    const ms = Date.now() - t0;
    
    // Get Redis info
    const info = await redis.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    
    await redis.quit();
    
    // Mask password in URL for security
    const safeUrl = redisUrl.replace(/:[^:@]*@/, ':***@');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'connected',
        pong,
        latencyMs: ms,
        redisUrl: safeUrl,
        redisVersion: version,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
    
  } catch (error: any) {
    console.error('Redis debug error:', error);
    
    // Mask any sensitive data in error messages
    const safeError = error.message.replace(/:[^:@]*@/, ':***@');
    
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'error',
        error: safeError,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
        timestamp: new Date().toISOString()
      }, null, 2)
    };
  }
}

export const handler = withErrorHandling<APIGatewayProxyEvent, APIGatewayProxyResult>(
  'debugRedis',
  baseHandler,
  {
    timeoutMs: 4000,
    retries: 1
  }
);
