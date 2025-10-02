import { ok, bad } from "../shared/responses.js";
import { getCase } from "../shared/db.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { validationMiddleware, commonSchemas } from "../shared/validation.js";

export async function handler(event:any){
  // Validate input first
  const validationSchema = commonSchemas.disputeId
    .merge(commonSchemas.merchantId)
    .strict();
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
  
  // Use validated input
  const input = (event.validatedInput ?? {}) as {
    id: string;
    merchant?: string;
  };
  const id = input.id;
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
  
  const item = await getCase(merchantId, id);
  return ok({ item });
}
