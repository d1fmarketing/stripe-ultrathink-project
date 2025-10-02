import { putMerchant } from "../shared/db.js";
import Stripe from 'stripe';
import { createAuditLog, AuditAction, auditFailure } from "../shared/auditLog.js";
import { fetchWithCircuitBreaker, stripeCircuitBreaker } from "../shared/circuitBreaker.js";

export async function handler(event:any){
  const qs = event.queryStringParameters || {};
  const code = qs.code;
  const state = qs.state; // Should contain firebase_uid
  
  if(!code) return { statusCode:400, body:'missing code' };

  const body = new URLSearchParams({
    client_secret: process.env.STRIPE_SECRET!,
    client_id: process.env.STRIPE_CLIENT_ID!,
    code, grant_type: 'authorization_code'
  });

  const r = await fetchWithCircuitBreaker(
    'https://connect.stripe.com/oauth/token',
    {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body
    },
    {
      breakerId: 'stripe:oauth.exchange',
      failureThreshold: 3,
      cooldownPeriod: 60_000
    }
  );
  const json:any = await r.json();
  if(!json.stripe_user_id) return { statusCode:400, body:`oauth failed: ${JSON.stringify(json)}` };

  // Extract all OAuth data
  const merchant_id = json.stripe_user_id;
  const access_token = json.access_token;
  const refresh_token = json.refresh_token;
  const token_type = json.token_type || 'bearer';
  const stripe_publishable_key = json.stripe_publishable_key;
  const scope = json.scope;
  const livemode = json.livemode || false;
  
  // Parse Firebase UID from state if provided
  let firebase_uid = null;
  try {
    if (state) {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      firebase_uid = stateData.firebase_uid;
    }
  } catch (e) {
    console.log('Could not parse state:', e);
  }

  // Save all OAuth data to DynamoDB
  await putMerchant({ 
    merchant_id,
    stripe_account_id: merchant_id,
    access_token, // CRITICAL: Save this for API calls
    refresh_token, // CRITICAL: Save this for token refresh
    token_type,
    stripe_publishable_key,
    scope,
    livemode,
    firebase_uid, // Link to Firebase user
    oauth_connected_at: new Date().toISOString()
  });
  
  // Audit successful OAuth connection
  await createAuditLog({
    action: AuditAction.OAUTH_CONNECT,
    userId: firebase_uid,
    merchantId: merchant_id,
    resourceType: 'stripe_account',
    resourceId: merchant_id,
    ipAddress: event.requestContext?.identity?.sourceIp,
    success: true,
    metadata: {
      scope,
      livemode,
      stripe_publishable_key
    }
  });

  // Register webhook endpoint for this connected account
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });
    const webhookEndpoint = await stripeCircuitBreaker(
      'webhookEndpoints.create',
      () => stripe.webhookEndpoints.create({
        url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe',
        enabled_events: [
          'charge.dispute.created',
          'charge.dispute.updated',
          'charge.dispute.closed',
          'charge.dispute.funds_reinstated',
          'charge.dispute.funds_withdrawn'
        ],
        connect: true // This makes it a Connect webhook
      }),
      {
        failureThreshold: 3,
        cooldownPeriod: 120_000
      }
    );
    
    console.log('Webhook endpoint registered:', webhookEndpoint.id);
    
    // Save webhook endpoint ID
    await putMerchant({
      merchant_id,
      webhook_endpoint_id: webhookEndpoint.id,
      webhook_secret: webhookEndpoint.secret
    });
  } catch (webhookError) {
    console.error('Failed to register webhook:', webhookError);
    // Continue even if webhook registration fails
  }

  // Redirect to frontend connect page with success
  const frontendCallbackUrl = `https://stripedshield-founders-1755231149.netlify.app/connect.html?success=true&stripe_account_id=${merchant_id}${firebase_uid ? '&uid=' + firebase_uid : ''}`;
  return { statusCode: 302, headers: { Location: frontendCallbackUrl }, body: '' };
}
