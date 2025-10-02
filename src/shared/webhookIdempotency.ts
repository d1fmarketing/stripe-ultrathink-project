import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import logger from './logger';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const IDEMPOTENCY_TABLE = process.env.CASES_TABLE || 'CasesTable';
const IDEMPOTENCY_TTL_HOURS = 24;

export class WebhookIdempotencyService {
  /**
   * Check if a webhook event has already been processed
   * @param eventId The Stripe event ID
   * @returns true if duplicate, false if new
   */
  static async isDuplicate(eventId: string): Promise<boolean> {
    try {
      const result = await ddb.send(new GetCommand({
        TableName: IDEMPOTENCY_TABLE,
        Key: {
          pk: `WEBHOOK#${eventId}`,
          sk: 'IDEMPOTENCY'
        }
      }));
      
      // If item exists, it's a duplicate
      if (result.Item) {
        logger.info('Duplicate webhook detected', { eventId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking webhook duplicate status', { error, eventId });
      // On error, assume not duplicate to avoid blocking
      return false;
    }
  }
  
  /**
   * Mark a webhook event as processed
   * @param eventId The Stripe event ID
   * @param metadata Optional metadata about the event
   */
  static async markProcessed(eventId: string, metadata?: any): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + (IDEMPOTENCY_TTL_HOURS * 3600);
    
    try {
      await ddb.send(new PutCommand({
        TableName: IDEMPOTENCY_TABLE,
        Item: {
          pk: `WEBHOOK#${eventId}`,
          sk: 'IDEMPOTENCY',
          eventId,
          processedAt: new Date().toISOString(),
          ttl, // DynamoDB will auto-delete after 24 hours
          metadata: metadata || {}
        }
      }));
      
      logger.info('Marked webhook as processed', { eventId, metadata });
    } catch (error) {
      logger.error('Error marking webhook as processed', { error, eventId });
      // Continue processing even if we can't mark it
    }
  }
  
  /**
   * Process webhook with idempotency check
   * @param eventId The Stripe event ID
   * @param handler The handler function to execute if not duplicate
   * @returns The result of the handler or null if duplicate
   */
  static async processOnce<T>(
    eventId: string, 
    handler: () => Promise<T>
  ): Promise<T | null> {
    // Check for duplicate
    if (await this.isDuplicate(eventId)) {
      logger.info('Skipping duplicate webhook event', { eventId });
      return null;
    }
    
    try {
      // Process the event
      const result = await handler();
      
      // Mark as processed
      await this.markProcessed(eventId, { 
        success: true,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      // Mark as processed even on error to prevent retry loops
      await this.markProcessed(eventId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
      
      throw error;
    }
  }
}

// Backwards compatibility export
export const isDuplicate = WebhookIdempotencyService.isDuplicate.bind(WebhookIdempotencyService);
export const markProcessed = WebhookIdempotencyService.markProcessed.bind(WebhookIdempotencyService);
export const processOnce = WebhookIdempotencyService.processOnce.bind(WebhookIdempotencyService);