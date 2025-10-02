import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './ddb';

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
        console.log(`[IDEMPOTENCY] Duplicate webhook detected: ${eventId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[IDEMPOTENCY] Error checking duplicate:', error);
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
      
      console.log(`[IDEMPOTENCY] Marked webhook as processed: ${eventId}`);
    } catch (error) {
      console.error('[IDEMPOTENCY] Error marking processed:', error);
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
      console.log(`[IDEMPOTENCY] Skipping duplicate event: ${eventId}`);
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