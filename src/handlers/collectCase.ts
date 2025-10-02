import { bad, createErrorResponse, getRequestOrigin, handleCorsPreflight, jsonResponse } from "../shared/responses.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { StartExecutionCommand, SFNClient as StepFunctionsClient } from "@aws-sdk/client-sfn";

const sfn = new StepFunctionsClient({});

export async function handler(event:any){
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'POST,OPTIONS');
  if (preflight) return preflight;

  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  const id = event.pathParameters?.id;
  const qs = event.queryStringParameters || {};
  const merchantId = qs.merchant || authContext.merchant_id;
  
  if(!merchantId || !id) return bad("missing merchant or id", { origin });
  
  // VERIFY USER OWNS THIS MERCHANT ACCOUNT
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return createErrorResponse(403, 'Access denied to this merchant account', undefined, { origin });
  }

  await sfn.send(new StartExecutionCommand({
    stateMachineArn: process.env.SFN_ARN!,
    input: JSON.stringify({ merchant: { stripe_account_id: merchantId }, dispute_id: id })
  }));

  return jsonResponse(202, { status: 'started' }, { origin });
}
