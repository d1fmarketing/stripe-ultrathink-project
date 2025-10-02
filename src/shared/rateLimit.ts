import { createErrorResponse } from './responses.js';
import { ddb } from './ddb.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const RATE_LIMIT_TABLE = process.env.CASES_TABLE!; // Reuse cases table

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  identifier: string;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const TTL_BUFFER_SECONDS = 60; // keep window records slightly longer than the window itself

/**
 * Simple rate limiting middleware using DynamoDB
 * @param config Rate limit configuration
 * @returns true if request should be allowed, false if rate limited
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const windowEnd = windowStart + config.windowSeconds;

  // Create a unique key for this rate limit window
  const pk = `RATELIMIT#${config.identifier}`;
  const sk = `WINDOW#${windowStart}`;

  try {
    const updateResult = await ddb.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk, sk },
      UpdateExpression: 'ADD #count :incr SET #ttl = :ttl, #windowStart = :windowStart, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#ttl': 'ttl',
        '#windowStart': 'windowStart',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':incr': 1,
        ':ttl': windowEnd + TTL_BUFFER_SECONDS,
        ':windowStart': windowStart,
        ':now': now,
        ':max': config.maxRequests
      },
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :max',
      ReturnValues: 'UPDATED_NEW'
    }));

    const currentCount = (updateResult.Attributes?.count as number | undefined) ?? 0;
    if (currentCount > 0) {
      const remaining = Math.max(0, config.maxRequests - currentCount);
      console.debug(`Rate limit usage for ${config.identifier}: ${currentCount}/${config.maxRequests} (remaining ${remaining})`);
    }

    return { allowed: true };
  } catch (error) {
    const err = error as { name?: string };
    if (error instanceof ConditionalCheckFailedException || err?.name === 'ConditionalCheckFailedException') {
      const retryAfter = Math.max(1, windowEnd - now);
      console.warn(`Rate limit exceeded for ${config.identifier}: max ${config.maxRequests} requests in ${config.windowSeconds}s window`);
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    console.error('Rate limit check error:', error);
    // Allow request on error to avoid blocking legitimate traffic
    return { allowed: true };
  }
}

/**
 * Get rate limit configuration for different API endpoints
 */
export function getRateLimitConfig(path: string, sourceIp: string): RateLimitConfig {
  // Different limits for different endpoints
  if (path.includes('/webhook')) {
    return {
      maxRequests: 1000, // 1000 webhook events per minute
      windowSeconds: 60,
      identifier: `webhook:${sourceIp}`
    };
  } else if (path.includes('/cases')) {
    return {
      maxRequests: 100, // 100 requests per minute for cases endpoint
      windowSeconds: 60,
      identifier: `cases:${sourceIp}`
    };
  } else if (path.includes('/auth')) {
    return {
      maxRequests: 20, // 20 auth attempts per minute
      windowSeconds: 60,
      identifier: `auth:${sourceIp}`
    };
  } else {
    // Default rate limit
    return {
      maxRequests: 200, // 200 requests per minute default
      windowSeconds: 60,
      identifier: `default:${sourceIp}`
    };
  }
}

/**
 * Express-style middleware for rate limiting
 */
export async function rateLimitMiddleware(event: any): Promise<any> {
  const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
  const path = event.path || '/';

  const config = getRateLimitConfig(path, sourceIp);
  const result = await checkRateLimit(config);

  if (!result.allowed) {
    const retryAfterSeconds = result.retryAfterSeconds ?? config.windowSeconds;
    return createErrorResponse(429, 'Too Many Requests', {
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: retryAfterSeconds
    }, {
      'Retry-After': retryAfterSeconds.toString()
    });
  }

  return null; // Continue processing
}
