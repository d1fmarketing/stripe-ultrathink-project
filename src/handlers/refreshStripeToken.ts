import Stripe from 'stripe';
import { ok, bad } from "../shared/responses.js";
import { requireAuth } from "../shared/auth.js";
import { getMerchantByAccount, putMerchant } from "../shared/db.js";
import { withErrorHandling } from "../shared/errorHandling.js";

/**
 * Refresh Stripe OAuth access token using refresh token
 */
async function baseHandler(event: any) {
  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult;
  }
  const authContext = authResult;
  
  if (!authContext.merchant_id) {
    return bad('No Stripe account connected');
  }
  
  try {
    // Get merchant record with refresh token
    const merchant = await getMerchantByAccount(authContext.stripe_account_id!);
    
    if (!merchant.refresh_token) {
      return bad('No refresh token available. Please reconnect your Stripe account.');
    }
    
    // Refresh the token
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: merchant.refresh_token,
      client_secret: process.env.STRIPE_SECRET!
    });
    
    const response = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    
    const json: any = await response.json();
    
    if (!json.access_token) {
      console.error('Token refresh failed:', json);
      return bad('Failed to refresh token: ' + (json.error_description || json.error));
    }
    
    // Save new tokens
    await putMerchant({
      merchant_id: authContext.merchant_id,
      access_token: json.access_token,
      refresh_token: json.refresh_token || merchant.refresh_token, // Use new refresh token if provided
      token_refreshed_at: new Date().toISOString()
    });
    
    return ok({
      message: 'Token refreshed successfully',
      expires_in: json.expires_in || 3600
    });
    
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return bad('Failed to refresh token: ' + error.message);
  }
}

export const handler = withErrorHandling('refreshStripeToken', baseHandler);
