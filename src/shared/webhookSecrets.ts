import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getSecretValue, getOptionalSecretValue } from './secretsManager';
import { getStripeClient } from './stripeClient';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const MERCHANTS_TABLE = process.env.MERCHANTS_TABLE || 'MerchantsTable';

/**
 * Get the webhook secret for a specific merchant account
 * Falls back to global secret if merchant-specific not found
 */
export async function getMerchantWebhookSecret(merchantId: string): Promise<string> {
  try {
    // First, try to get merchant-specific webhook secret from DynamoDB
    const result = await ddb.send(new GetCommand({
      TableName: MERCHANTS_TABLE,
      Key: {
        pk: `MERCHANT#${merchantId}`
      }
    }));
    
    if (result.Item?.webhook_secret) {
      console.log(`[WEBHOOK] Using merchant-specific webhook secret for ${merchantId}`);
      return result.Item.webhook_secret;
    }
    
    // If no merchant-specific secret, check for endpoint ID and construct
    if (result.Item?.webhook_endpoint_id) {
      // For Connect webhooks, the secret follows a pattern
      // but we should have stored it during webhook registration
      console.log(`[WEBHOOK] Found webhook endpoint ID but no secret for ${merchantId}`);
    }
  } catch (error) {
    console.error(`[WEBHOOK] Error fetching merchant webhook secret:`, error);
  }
  
  // Fallback to Secrets Manager global secrets
  const connectSecret = await getConnectWebhookSecret();
  if (connectSecret) {
    console.log('[WEBHOOK] Using global connect webhook secret from Secrets Manager');
    return connectSecret;
  }

  return getGlobalWebhookSecret();
}

/**
 * Get the global webhook secret from environment or SSM
 */
export async function getGlobalWebhookSecret(): Promise<string> {
  const secret = (await getSecretValue('STRIPE_WEBHOOK_SECRET')).trim();
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured in Secrets Manager');
  }
  return secret;
}

async function getConnectWebhookSecret(): Promise<string | undefined> {
  const secret = await getOptionalSecretValue('STRIPE_CONNECT_WEBHOOK_SECRET');
  return secret?.trim() || undefined;
}

/**
 * Validate webhook signature using the appropriate secret
 * @param payload The raw webhook payload
 * @param signature The Stripe-Signature header
 * @param accountId Optional Stripe account ID for Connect webhooks
 */
export async function validateWebhookSignature(
  payload: string | Buffer,
  signature: string,
  accountId?: string
): Promise<boolean> {
  const stripe = await getStripeClient();
  
  try {
    // Get the appropriate webhook secret
    const webhookSecret = accountId
      ? await getMerchantWebhookSecret(accountId)
      : await getGlobalWebhookSecret();

    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    
    console.log(`[WEBHOOK] Signature validated for event ${event.id}`);
    return true;
  } catch (error) {
    console.error('[WEBHOOK] Signature validation failed:', error);
    return false;
  }
}

/**
 * Store a webhook secret for a merchant after registering webhook endpoint
 * @param merchantId The merchant/account ID
 * @param webhookSecret The webhook secret from Stripe
 * @param webhookEndpointId Optional webhook endpoint ID
 */
export async function storeWebhookSecret(
  merchantId: string, 
  webhookSecret: string,
  webhookEndpointId?: string
): Promise<void> {
  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  
  try {
    await ddb.send(new UpdateCommand({
      TableName: MERCHANTS_TABLE,
      Key: {
        pk: `MERCHANT#${merchantId}`
      },
      UpdateExpression: 'SET webhook_secret = :secret, webhook_endpoint_id = :endpoint, webhook_secret_updated = :now',
      ExpressionAttributeValues: {
        ':secret': webhookSecret,
        ':endpoint': webhookEndpointId || null,
        ':now': new Date().toISOString()
      }
    }));
    
    console.log(`[WEBHOOK] Stored webhook secret for merchant ${merchantId}`);
  } catch (error) {
    console.error('[WEBHOOK] Error storing webhook secret:', error);
    throw error;
  }
}