import { ok, bad } from "../shared/responses.js";
import { listCases } from "../shared/db.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { rateLimitMiddleware } from "../shared/rateLimit.js";
import { validationMiddleware, commonSchemas } from "../shared/validation.js";
import { cachingStrategy } from "../shared/cacheStrategy.js";

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
  
  const cacheKey = cachingStrategy.buildKey('cases', merchantId, input.status || 'all');

  const cacheResult = await cachingStrategy.wrap(cacheKey, async () => {
    const items = await listCases(merchantId, input.status);
    const out = items.map((i:any)=>({
      dispute_id:i.dispute_id,
      amount_cents:i.amount_cents,
      currency:i.currency,
      reason:i.reason,
      status:i.status,
      due_by_epoch:i.due_by_epoch
    }));

    return { items: out };
  }, {
    memoryTTL: 30,
    redisTTL: 90,
    staleWhileRevalidate: true,
    staleTTL: 60,
    tags: [`merchant:${merchantId}`, 'cases']
  });

  if (cacheResult.metadata.source !== 'origin') {
    console.log(`[CACHE HIT] Returning cached cases for ${merchantId} from ${cacheResult.metadata.source}`);
  }

  return ok(cacheResult.value);
}
