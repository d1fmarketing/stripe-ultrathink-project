import { createErrorResponse } from './responses.js';
import { ddb } from './ddb.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

const RATE_LIMIT_TABLE = process.env.CASES_TABLE!; // Reuse cases table

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  identifier: string;
}

/**
 * Simple rate limiting middleware using DynamoDB
 * @param config Rate limit configuration
 * @returns true if request should be allowed, false if rate limited
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;

  // Create a unique key for this rate limit window
  const pk = `RATELIMIT#${config.identifier}`;
  const sk = `WINDOW#${bucketStart}`;
  
  try {
    const ttl = bucketStart + config.windowSeconds + 60; // give a small buffer past the window end

    await ddb.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk, sk },
      UpdateExpression: 'SET count = if_not_exists(count, :zero) + :increment, ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(count) OR count < :maxRequests',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':increment': 1,
        ':maxRequests': config.maxRequests,
        ':ttl': ttl
      },
      ReturnValues: 'UPDATED_NEW'
    }));

    return true;
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      console.log(`Rate limit exceeded for ${config.identifier}`);
      return false;
    }

    console.error('Rate limit check error:', error);
    // Allow request on error to avoid blocking legitimate traffic
    return true;
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
  const allowed = await checkRateLimit(config);
  
  if (!allowed) {
    return createErrorResponse(429, 'Too Many Requests', {
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: config.windowSeconds
    });
  }
  
  return null; // Continue processing
}