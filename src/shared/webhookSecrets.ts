import Stripe from 'stripe';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ssm = new SSMClient({});

const MERCHANTS_TABLE = process.env.MERCHANTS_TABLE || 'MerchantsTable';
const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = Number(
  process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE ?? '300'
);

let cachedStripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(process.env.STRIPE_SECRET!, {
      apiVersion: '2025-07-30.basil'
    });
  }

  return cachedStripeClient;
}

function extractTimestamp(signature: string): number | null {
  const match = signature.match(/t=(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  
  // Fallback to global webhook secret from environment/SSM
  return getGlobalWebhookSecret();
}

/**
 * Get the global webhook secret from environment or SSM
 */
async function getGlobalWebhookSecret(): Promise<string> {
  // First check environment variable
  if (process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    console.log('[WEBHOOK] Using global webhook secret from environment');
    return process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  }
  
  // Try to fetch from SSM Parameter Store
  try {
    const result = await ssm.send(new GetParameterCommand({
      Name: '/stripedshield/prod/STRIPE_WEBHOOK_SECRET',
      WithDecryption: true
    }));
    
    if (result.Parameter?.Value) {
      console.log('[WEBHOOK] Using global webhook secret from SSM');
      return result.Parameter.Value;
    }
  } catch (error) {
    console.error('[WEBHOOK] Error fetching webhook secret from SSM:', error);
  }
  
  // Last resort fallback - should not happen in production
  console.error('[WEBHOOK] WARNING: No webhook secret found, webhooks will fail validation!');
  throw new Error('No webhook secret configured');
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
  accountId?: string,
  options: { toleranceSeconds?: number; stripeClient?: Stripe } = {}
): Promise<Stripe.Event> {
  if (!signature) {
    throw new Error('Missing Stripe-Signature header');
  }

  const timestamp = extractTimestamp(signature);
  if (!timestamp) {
    throw new Error('Stripe-Signature header missing timestamp');
  }

  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new Error(`Webhook signature timestamp outside of tolerance (${toleranceSeconds}s)`);
  }

  const stripe = options.stripeClient ?? getStripeClient();

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
    return event;
  } catch (error) {
    console.error('[WEBHOOK] Signature validation failed:', error);
    throw error;
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