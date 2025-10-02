import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import logger from './logger';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ssm = new SSMClient({});

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
      logger.info('Using merchant-specific webhook secret', { merchantId });
      return result.Item.webhook_secret;
    }
    
    // If no merchant-specific secret, check for endpoint ID and construct
    if (result.Item?.webhook_endpoint_id) {
      // For Connect webhooks, the secret follows a pattern
      // but we should have stored it during webhook registration
      logger.warn('Merchant webhook endpoint ID found but no secret stored', { merchantId });
    }
  } catch (error) {
    logger.error('Error fetching merchant webhook secret', { error, merchantId });
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
    logger.info('Using global webhook secret from environment');
    return process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  }
  
  // Try to fetch from SSM Parameter Store
  try {
    const result = await ssm.send(new GetParameterCommand({
      Name: '/stripedshield/prod/STRIPE_WEBHOOK_SECRET',
      WithDecryption: true
    }));
    
    if (result.Parameter?.Value) {
      logger.info('Using global webhook secret from SSM');
      return result.Parameter.Value;
    }
  } catch (error) {
    logger.error('Error fetching webhook secret from SSM', { error });
  }

  // Last resort fallback - should not happen in production
  logger.error('No webhook secret found; webhooks will fail validation');
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
  accountId?: string
): Promise<boolean> {
  const Stripe = require('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });

  let eventId: string | undefined;
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

    eventId = event.id;
    logger.info('Webhook signature validated', { eventId });
    return true;
  } catch (error) {
    logger.error('Webhook signature validation failed', { error, eventId });
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
    
    logger.info('Stored webhook secret for merchant', { merchantId });
  } catch (error) {
    logger.error('Error storing webhook secret', { error, merchantId });
    throw error;
  }
}