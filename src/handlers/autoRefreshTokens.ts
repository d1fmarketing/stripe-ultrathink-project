import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../shared/ddb.js";
import { putMerchant } from "../shared/db.js";
import { withErrorHandling } from "../shared/errorHandling.js";

/**
 * Scheduled Lambda to refresh OAuth tokens before they expire
 * Should run daily via EventBridge
 */
async function baseHandler(event: any) {
  const MERCHANTS_TABLE = process.env.MERCHANTS_TABLE!;
  const REFRESH_BEFORE_HOURS = 24; // Refresh tokens 24 hours before expiry
  
  try {
    // Scan for all merchants with OAuth tokens
    const scanResult = await ddb.send(new ScanCommand({
      TableName: MERCHANTS_TABLE,
      FilterExpression: 'attribute_exists(access_token) AND attribute_exists(refresh_token)'
    }));
    
    const merchants = scanResult.Items || [];
    console.log(`Found ${merchants.length} merchants with OAuth tokens`);
    
    const results = {
      checked: merchants.length,
      refreshed: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Check each merchant
    for (const merchant of merchants) {
      try {
        // Check if token needs refresh
        const lastRefresh = merchant.token_refreshed_at || merchant.oauth_connected_at;
        if (!lastRefresh) continue;
        
        const lastRefreshTime = new Date(lastRefresh).getTime();
        const now = Date.now();
        const hoursSinceRefresh = (now - lastRefreshTime) / (1000 * 60 * 60);
        
        // Stripe OAuth tokens typically last 90 days, refresh after 89 days
        if (hoursSinceRefresh > (89 * 24)) {
          console.log(`Refreshing token for merchant ${merchant.merchant_id}`);
          
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
          
          if (json.access_token) {
            // Save new tokens
            await putMerchant({
              merchant_id: merchant.merchant_id,
              access_token: json.access_token,
              refresh_token: json.refresh_token || merchant.refresh_token,
              token_refreshed_at: new Date().toISOString()
            });
            
            results.refreshed++;
            console.log(`Successfully refreshed token for ${merchant.merchant_id}`);
          } else {
            throw new Error(json.error_description || json.error || 'Unknown error');
          }
        }
      } catch (error: any) {
        console.error(`Failed to refresh token for ${merchant.merchant_id}:`, error);
        results.failed++;
        results.errors.push(`${merchant.merchant_id}: ${error.message}`);
      }
    }
    
    console.log('Token refresh results:', results);
    
    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };
    
  } catch (error: any) {
    console.error('Auto refresh error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}

export const handler = withErrorHandling('autoRefreshTokens', baseHandler);

