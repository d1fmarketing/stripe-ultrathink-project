import Redis from 'ioredis';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRequestOrigin, handleCorsPreflight, jsonResponse } from '../shared/responses.js';

/**
 * Debug endpoint to test Redis connectivity
 * Helps diagnose Redis connection issues
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'GET,OPTIONS');
  if (preflight) {
    return preflight;
  }

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
    
    return jsonResponse(200, {
      status: 'connected',
      pong,
      latencyMs: ms,
      redisUrl: safeUrl,
      redisVersion: version,
      timestamp: new Date().toISOString()
    }, {
      origin,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
  } catch (error: any) {
    console.error('Redis debug error:', error);
    
    // Mask any sensitive data in error messages
    const safeError = error.message.replace(/:[^:@]*@/, ':***@');
    
    return jsonResponse(503, {
      status: 'error',
      error: safeError,
      redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
      timestamp: new Date().toISOString()
    }, {
      origin,
      headers: { 'Cache-Control': 'no-cache' }
    });
  }
};