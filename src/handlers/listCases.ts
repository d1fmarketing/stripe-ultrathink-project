import { ok, bad } from "../shared/responses.js";
import { listCases } from "../shared/db.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { rateLimitMiddleware } from "../shared/rateLimit.js";
import { validationMiddleware, commonSchemas } from "../shared/validation.js";
import Redis from "ioredis";
import logger from '../shared/logger';

// Initialize Redis with lazy connection
let redis: Redis | null = null;

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 50, 500),
      connectTimeout: 3000,
      lazyConnect: true
    });
  }
  return redis;
}

export async function handler(event:any){
  // Check rate limit first
  const rateLimitResult = await rateLimitMiddleware(event);
  if (rateLimitResult) {
    return rateLimitResult; // Return 429 if rate limited
  }
  
  // Validate input
  const validationSchema = {
    ...commonSchemas.merchantId,
    ...commonSchemas.disputeStatus,
    ...commonSchemas.pagination
  };
  const validationResult = await validationMiddleware(event, validationSchema);
  if (validationResult) {
    return validationResult; // Return 400 if validation fails
  }
  
  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  // Use validated and sanitized input
  const input = event.validatedInput || {};
  let merchantId = input.merchant || '';
  
  // If no merchant specified, use the user's own merchant ID
  if (!merchantId && authContext.merchant_id) {
    merchantId = authContext.merchant_id;
  }
  
  if(!merchantId) return bad("missing merchant param or no connected Stripe account");
  
  // VERIFY USER OWNS THIS MERCHANT ACCOUNT
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Access denied to this merchant account' })
    };
  }
  
  // Try Redis cache first for performance
  const cacheKey = `cases:${merchantId}:${input.status || 'all'}`;
  const redisClient = getRedis();
  
  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info('Returning cached cases from cache', { merchantId });
        return ok(JSON.parse(cached));
      }
    } catch (error) {
      logger.warn('Redis read failed, falling back to DB', { error, merchantId });
      // Continue to database on Redis error
    }
  }
  
  // Query database
  const items = await listCases(merchantId, input.status);
  
  // Keep the payload minimal for the tiny admin UI
  const out = items.map((i:any)=>({ 
    dispute_id:i.dispute_id, 
    amount_cents:i.amount_cents, 
    currency:i.currency, 
    reason:i.reason, 
    status:i.status, 
    due_by_epoch:i.due_by_epoch 
  }));
  
  const response = { items: out };
  
  // Cache the response for 90 seconds
  if (redisClient) {
    try {
      await redisClient.setex(cacheKey, 90, JSON.stringify(response));
      logger.info('Cached cases', { merchantId, ttlSeconds: 90 });
    } catch (error) {
      logger.warn('Redis write failed', { error, merchantId });
      // Continue even if caching fails
    }
  }
  
  return ok(response);
}
