import { createErrorResponse } from './responses.js';
import { ddb } from './ddb.js';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { AuthContext, validateAuth } from './auth.js';

const RATE_LIMIT_TABLE = process.env.CASES_TABLE!; // Reuse cases table

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  identifier: string;
}

interface RateLimitContext {
  userId?: string;
  merchantId?: string;
  identifierSuffix?: string;
}

interface RateLimitOptions {
  authContext?: AuthContext | null;
  merchantId?: string | null;
  identifierSuffix?: string;
  skipAuthLookup?: boolean;
}

/**
 * Simple rate limiting middleware using DynamoDB
 * @param config Rate limit configuration
 * @returns true if request should be allowed, false if rate limited
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.windowSeconds;
  
  // Create a unique key for this rate limit window
  const pk = `RATELIMIT#${config.identifier}`;
  const sk = `WINDOW#${windowStart}`;
  
  try {
    // Get current window data
    const result = await ddb.send(new GetCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk, sk }
    }));
    
    const currentCount = result.Item?.count || 0;
    
    // Check if rate limit exceeded
    if (currentCount >= config.maxRequests) {
      console.log(`Rate limit exceeded for ${config.identifier}: ${currentCount}/${config.maxRequests}`);
      return false;
    }
    
    // Increment counter
    await ddb.send(new PutCommand({
      TableName: RATE_LIMIT_TABLE,
      Item: {
        pk,
        sk,
        count: currentCount + 1,
        ttl: now + config.windowSeconds + 3600 // TTL: window + 1 hour
      }
    }));
    
    return true;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow request on error to avoid blocking legitimate traffic
    return true;
  }
}

/**
 * Get rate limit configuration for different API endpoints
 */
export function getRateLimitConfig(path: string, sourceIp: string, context: RateLimitContext = {}): RateLimitConfig {
  const scope = context.merchantId
    ? `merchant:${context.merchantId}`
    : context.userId
      ? `user:${context.userId}`
      : `ip:${sourceIp}`;

  const suffix = context.identifierSuffix ? `:${context.identifierSuffix}` : '';

  // Different limits for different endpoints
  if (path.includes('/webhook')) {
    return {
      maxRequests: 1000, // 1000 webhook events per minute
      windowSeconds: 60,
      identifier: `webhook:${scope}${suffix}`
    };
  } else if (path.includes('/cases')) {
    return {
      maxRequests: 100, // 100 requests per minute for cases endpoint
      windowSeconds: 60,
      identifier: `cases:${scope}${suffix}`
    };
  } else if (path.includes('/auth')) {
    return {
      maxRequests: 20, // 20 auth attempts per minute
      windowSeconds: 60,
      identifier: `auth:${scope}${suffix}`
    };
  } else {
    // Default rate limit
    return {
      maxRequests: 200, // 200 requests per minute default
      windowSeconds: 60,
      identifier: `default:${scope}${suffix}`
    };
  }
}

/**
 * Express-style middleware for rate limiting
 */
export async function rateLimitMiddleware(event: any, options: RateLimitOptions = {}): Promise<any> {
  const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
  const path = event.path || '/';

  let authContext = options.authContext ?? (event?.authContext as AuthContext | undefined);

  if (!authContext && !options.skipAuthLookup) {
    try {
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      if (authHeader) {
        authContext = await validateAuth(authHeader) ?? undefined;
        if (authContext) {
          (event as any).authContext = authContext;
        }
      }
    } catch (error) {
      console.warn('Rate limit auth lookup failed:', error);
    }
  }

  const merchantId = options.merchantId
    ?? event?.queryStringParameters?.merchant
    ?? authContext?.merchant_id
    ?? authContext?.stripe_account_id
    ?? undefined;

  const config = getRateLimitConfig(path, sourceIp, {
    userId: authContext?.uid,
    merchantId,
    identifierSuffix: options.identifierSuffix
  });
  const allowed = await checkRateLimit(config);

  if (!allowed) {
    return createErrorResponse(429, 'Too Many Requests', {
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: config.windowSeconds
    });
  }
  
  return null; // Continue processing
}