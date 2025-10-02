import { bad } from "../shared/responses.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { createAuditLog, AuditAction } from "../shared/auditLog.js";
import { StartExecutionCommand, SFNClient as StepFunctionsClient } from "@aws-sdk/client-sfn";
import { env } from "../shared/env.js";

const sfn = new StepFunctionsClient({});

export async function handler(event:any){
  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  const id = event.pathParameters?.id;
  const qs = event.queryStringParameters || {};
  const merchantId = qs.merchant || authContext.merchant_id;
  
  if(!merchantId || !id) return bad("missing merchant or id");
  
  // VERIFY USER OWNS THIS MERCHANT ACCOUNT
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Access denied to this merchant account' })
    };
  }

  await sfn.send(new StartExecutionCommand({
    stateMachineArn: env.SFN_ARN,
    input: JSON.stringify({ merchant: { stripe_account_id: merchantId }, dispute_id: id })
  }));

  return { statusCode:202, body:'started' };
}
