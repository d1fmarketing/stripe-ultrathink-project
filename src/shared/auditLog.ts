import { ddb } from './ddb.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

const AUDIT_TABLE = process.env.AUDIT_TABLE || process.env.CASES_TABLE!;

export enum AuditAction {
  // Authentication
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  
  // OAuth
  OAUTH_CONNECT = 'OAUTH_CONNECT',
  OAUTH_DISCONNECT = 'OAUTH_DISCONNECT',
  OAUTH_TOKEN_REFRESH = 'OAUTH_TOKEN_REFRESH',
  
  // Disputes
  DISPUTE_CREATED = 'DISPUTE_CREATED',
  DISPUTE_UPDATED = 'DISPUTE_UPDATED',
  EVIDENCE_COLLECTED = 'EVIDENCE_COLLECTED',
  EVIDENCE_SUBMITTED = 'EVIDENCE_SUBMITTED',
  DISPUTE_RETRY = 'DISPUTE_RETRY',
  
  // Subscriptions
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  
  // Admin
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  API_ACCESS = 'API_ACCESS',
  
  // Errors
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS'
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  userId?: string;
  userEmail?: string;
  merchantId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  ttl?: number;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ttl'>): Promise<void> {
  try {
    const auditEntry: AuditLogEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    };
    
    // Store in DynamoDB
    await ddb.send(new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        pk: `AUDIT#${auditEntry.timestamp.slice(0, 10)}`, // Partition by date
        sk: `LOG#${auditEntry.timestamp}#${auditEntry.id}`,
        ...auditEntry
      }
    }));
    
    // Log to CloudWatch for real-time monitoring
    logger.info('Audit log created', {
      action: auditEntry.action,
      userId: auditEntry.userId,
      resourceId: auditEntry.resourceId,
      success: auditEntry.success,
      correlationId: auditEntry.correlationId,
    });

  } catch (error) {
    // Don't fail the operation if audit logging fails
    logger.error('Failed to create audit log', { error, action: entry.action });
  }
}

/**
 * Audit middleware for Lambda handlers
 */
export async function auditMiddleware(
  event: any,
  action: AuditAction,
  extractResource?: (event: any) => { type: string; id: string }
): Promise<void> {
  try {
    // Extract common fields
    const authContext = event.authContext || {};
    const requestContext = event.requestContext || {};
    const identity = requestContext.identity || {};
    
    // Extract resource info if provided
    const resource = extractResource ? extractResource(event) : undefined;
    
    // Extract correlation ID from headers
    const correlationId = event.headers?.['X-Request-ID'] || 
                          event.headers?.['x-request-id'] || 
                          requestContext.requestId;
    
    await createAuditLog({
      action,
      userId: authContext.uid || authContext.userId,
      userEmail: authContext.email,
      merchantId: authContext.merchant_id,
      resourceType: resource?.type,
      resourceId: resource?.id,
      ipAddress: identity.sourceIp,
      userAgent: identity.userAgent,
      correlationId,
      success: true, // Will be updated by handler if it fails
      metadata: {
        path: event.path,
        method: event.httpMethod,
        queryParams: event.queryStringParameters,
        stage: requestContext.stage
      }
    });
  } catch (error) {
    logger.error('Audit middleware error', { error, action });
  }
}

/**
 * Log a failed operation
 */
export async function auditFailure(
  event: any,
  action: AuditAction,
  error: Error | string,
  resourceInfo?: { type: string; id: string }
): Promise<void> {
  try {
    const authContext = event.authContext || {};
    const requestContext = event.requestContext || {};
    const identity = requestContext.identity || {};
    
    await createAuditLog({
      action,
      userId: authContext.uid,
      userEmail: authContext.email,
      merchantId: authContext.merchant_id,
      resourceType: resourceInfo?.type,
      resourceId: resourceInfo?.id,
      ipAddress: identity.sourceIp,
      userAgent: identity.userAgent,
      correlationId: requestContext.requestId,
      success: false,
      errorMessage: typeof error === 'string' ? error : error.message,
      metadata: {
        path: event.path,
        method: event.httpMethod,
        errorStack: typeof error === 'object' ? error.stack : undefined
      }
    });
  } catch (auditError) {
    logger.error('Failed to audit failure', { error: auditError, action });
  }
}

/**
 * Track critical security events
 */
export async function auditSecurityEvent(
  event: any,
  action: AuditAction.UNAUTHORIZED_ACCESS | AuditAction.RATE_LIMITED,
  details: string
): Promise<void> {
  try {
    const requestContext = event.requestContext || {};
    const identity = requestContext.identity || {};
    
    await createAuditLog({
      action,
      ipAddress: identity.sourceIp,
      userAgent: identity.userAgent,
      correlationId: requestContext.requestId,
      success: false,
      errorMessage: details,
      metadata: {
        path: event.path,
        method: event.httpMethod,
        headers: event.headers,
        timestamp: new Date().toISOString()
      }
    });
    
    // Alert on security events (could trigger SNS notification)
    logger.warn('Security event recorded', { action, details, sourceIp: identity.sourceIp });

  } catch (error) {
    logger.error('Failed to audit security event', { error, action });
  }
}

/**
 * Helper to get audit logs for a user or merchant
 */
export async function getAuditLogs(
  filters: {
    userId?: string;
    merchantId?: string;
    action?: AuditAction;
    startDate?: string;
    endDate?: string;
  }
): Promise<AuditLogEntry[]> {
  // Implementation would query DynamoDB with filters
  // This is a placeholder for the query logic
  logger.debug('Fetching audit logs with filters', filters);
  return [];
}