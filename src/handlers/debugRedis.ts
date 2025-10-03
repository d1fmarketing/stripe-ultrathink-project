import Redis from 'ioredis';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAuth } from '../shared/auth.js';
import {
  applyRateLimit,
  applySecurityHeaders,
  buildCorsHeaders,
  getClientIp,
  logSecurityEvent
} from '../shared/security.js';

const debugRateLimitWindowMs = Number(process.env.DEBUG_REDIS_RATE_LIMIT_WINDOW_MS ?? '60000');
const debugRateLimitMax = Number(process.env.DEBUG_REDIS_RATE_LIMIT_MAX ?? '5');
const defaultAllowedDebugEmails = ['founder@stripedshield.com'];
const configuredDebugEmails = (process.env.DEBUG_REDIS_ALLOWED_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);
const allowedDebugEmails = new Set<string>([...defaultAllowedDebugEmails, ...configuredDebugEmails]);
const allowAllDebug = process.env.ALLOW_DEBUG_REDIS_ALL === 'true';

/**
 * Debug endpoint to test Redis connectivity
 * Helps diagnose Redis connection issues
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const cors = buildCorsHeaders(event);
  const baseHeaders = applySecurityHeaders({
    ...cors.headers,
    'Content-Type': 'application/json'
  }, {}, { rateLimitLimit: debugRateLimitMax });

  const withOverrides = (overrides: Record<string, string>) =>
    applySecurityHeaders(baseHeaders, overrides, { rateLimitLimit: debugRateLimitMax });

  if (!cors.originAllowed) {
    logSecurityEvent('cors_blocked', {
      endpoint: 'debugRedis',
      originAttempted: event.headers?.origin || event.headers?.Origin || 'unknown',
      clientIp: getClientIp(event)
    });

    return {
      statusCode: 403,
      headers: baseHeaders,
      body: JSON.stringify({ error: 'Origin not allowed' })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: baseHeaders,
      body: ''
    };
  }

  const authOrError = await requireAuth(event);
  if ('statusCode' in authOrError) {
    logSecurityEvent('unauthorized_access', {
      endpoint: 'debugRedis',
      clientIp: getClientIp(event)
    });

    return {
      statusCode: 401,
      headers: baseHeaders,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  const authContext = authOrError;
  const normalizedEmail = authContext.email?.toLowerCase() || '';
  const isAllowed = allowAllDebug || allowedDebugEmails.has(normalizedEmail);

  if (!isAllowed) {
    logSecurityEvent('forbidden_access', {
      endpoint: 'debugRedis',
      clientIp: getClientIp(event),
      userId: authContext.uid
    });

    return {
      statusCode: 403,
      headers: baseHeaders,
      body: JSON.stringify({ error: 'Forbidden' })
    };
  }

  const clientIp = getClientIp(event);
  const rateKey = `debugRedis:${authContext.uid}`;
  const rateResult = applyRateLimit(rateKey, {
    windowMs: debugRateLimitWindowMs,
    max: debugRateLimitMax
  });

  if (!rateResult.allowed) {
    logSecurityEvent('rate_limit_block', {
      endpoint: 'debugRedis',
      clientIp,
      userId: authContext.uid,
      resetTime: new Date(rateResult.resetTime).toISOString()
    });

    return {
      statusCode: 429,
      headers: withOverrides({
        'Retry-After': Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString(),
        'X-RateLimit-Remaining': '0'
      }),
      body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
    };
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
    
    return {
      statusCode: 200,
      headers: withOverrides({
        'Cache-Control': 'no-cache',
        'X-RateLimit-Remaining': rateResult.remaining.toString()
      }),
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
    logSecurityEvent('debug_redis_error', {
      message: error?.message,
      userId: authContext.uid,
      clientIp
    });

    // Mask any sensitive data in error messages
    const safeError = (error?.message || 'Unknown error').replace(/:[^:@]*@/, ':***@');

    return {
      statusCode: 503,
      headers: withOverrides({
        'Cache-Control': 'no-cache',
        'X-RateLimit-Remaining': rateResult.remaining.toString()
      }),
      body: JSON.stringify({
        status: 'error',
        error: safeError,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
        timestamp: new Date().toISOString()
      }, null, 2)
    };
  }
};