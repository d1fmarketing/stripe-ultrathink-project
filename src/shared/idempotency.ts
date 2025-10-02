import crypto from 'crypto';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './ddb.js';

const IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || process.env.CASES_TABLE || 'CasesTable';
const IDEMPOTENCY_TTL_HOURS = Number(process.env.IDEMPOTENCY_TTL_HOURS || '24');
const IDEMPOTENCY_SORT_KEY = 'IDEMPOTENCY';

export interface StoredHttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface IdempotencyRecord {
  pk: string;
  sk: string;
  key: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response?: StoredHttpResponse;
  error?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function defaultHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Requested-With,X-Request-ID,Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function mergeHeaderValues(existing: string, incoming: string): string {
  const existingParts = existing.split(',').map((part) => part.trim()).filter(Boolean);
  const incomingParts = incoming.split(',').map((part) => part.trim()).filter(Boolean);
  const merged = new Set<string>(existingParts);
  for (const part of incomingParts) {
    if (part) {
      merged.add(part);
    }
  }
  return Array.from(merged).join(',');
}

function normalizeHeaders(headers?: Record<string, any>): Record<string, string> {
  const base = defaultHeaders();
  if (!headers) return base;
  const normalized: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    const stringValue = String(value);
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'access-control-allow-headers') {
      normalized[key] = mergeHeaderValues(base['Access-Control-Allow-Headers'], stringValue + ',Idempotency-Key');
    } else if (lowerKey === 'access-control-allow-methods') {
      normalized[key] = mergeHeaderValues(base['Access-Control-Allow-Methods'], stringValue);
    } else {
      normalized[key] = stringValue;
    }
  }
  return normalized;
}

function normalizeResponse(result: any): StoredHttpResponse {
  if (!result || typeof result !== 'object') {
    return {
      statusCode: 200,
      headers: defaultHeaders(),
      body: JSON.stringify(result ?? {})
    };
  }

  const statusCode = typeof result.statusCode === 'number' ? result.statusCode : 200;
  const headers = normalizeHeaders(result.headers as Record<string, any> | undefined);
  let body: string | undefined;

  if (typeof result.body === 'string') {
    body = result.body;
  } else if (result.body !== undefined) {
    body = JSON.stringify(result.body);
  } else if ('statusCode' in result) {
    body = '';
  } else {
    body = JSON.stringify(result);
  }

  return { statusCode, headers, body };
}

function deserializeResponse(record: StoredHttpResponse): StoredHttpResponse {
  const headers = normalizeHeaders(record.headers);
  return {
    statusCode: record.statusCode,
    headers,
    body: record.body ?? ''
  };
}

function ttlSeconds(): number {
  return Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_HOURS * 3600;
}

function buildPartitionKey(key: string): string {
  return `IDEMPOTENCY#${key}`;
}

async function getRecord(partitionKey: string): Promise<IdempotencyRecord | null> {
  const result = await ddb.send(new GetCommand({
    TableName: IDEMPOTENCY_TABLE,
    Key: { pk: partitionKey, sk: IDEMPOTENCY_SORT_KEY }
  }));

  return (result.Item as IdempotencyRecord | undefined) || null;
}

async function putRecord(record: IdempotencyRecord, condition?: string) {
  await ddb.send(new PutCommand({
    TableName: IDEMPOTENCY_TABLE,
    Item: record,
    ...(condition ? { ConditionExpression: condition } : {})
  }));
}

function missingKeyResponse(): StoredHttpResponse {
  return {
    statusCode: 400,
    headers: defaultHeaders(),
    body: JSON.stringify({
      error: 'Missing Idempotency-Key header. Provide a unique key for POST, PUT, PATCH, and DELETE requests.'
    })
  };
}

function inProgressResponse(): StoredHttpResponse {
  return {
    statusCode: 409,
    headers: defaultHeaders(),
    body: JSON.stringify({
      error: 'Request with this idempotency key is still being processed. Please retry after a short delay.'
    })
  };
}

function errorToResponse(error: unknown): StoredHttpResponse {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return normalizeResponse(error);
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return {
    statusCode: 500,
    headers: defaultHeaders(),
    body: JSON.stringify({ error: message })
  };
}

function attachReplayHeader(response: StoredHttpResponse): StoredHttpResponse {
  return {
    ...response,
    headers: {
      ...response.headers,
      'Idempotent-Replayed': 'true'
    }
  };
}

function sanitizeKey(key: string): string {
  return key.trim().replace(/\s+/g, ' ');
}

function hashBody(body: string | undefined | null): string | undefined {
  if (!body) return undefined;
  return crypto.createHash('sha256').update(body).digest('hex');
}

export class IdempotencyService {
  static extractKey(event: any): string | null {
    const headers = event?.headers || {};
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'idempotency-key') {
        const value = headers[name];
        if (typeof value === 'string' && value.trim()) {
          return sanitizeKey(value);
        }
      }
    }

    // Fallback to X-Request-ID if present to avoid silent duplicates
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'x-request-id') {
        const value = headers[name];
        if (typeof value === 'string' && value.trim()) {
          return sanitizeKey(value);
        }
      }
    }

    return null;
  }

  static async handleHttp(event: any, operation: () => Promise<any>): Promise<any> {
    const method = (event?.httpMethod || '').toUpperCase();
    if (!WRITE_METHODS.has(method)) {
      return operation();
    }

    const key = this.extractKey(event);
    if (!key) {
      return missingKeyResponse();
    }

    const metadata = {
      method,
      path: event?.path || '',
      bodyHash: hashBody(event?.body),
      queryHash: hashBody(JSON.stringify(event?.queryStringParameters || {}))
    };

    return this.executeWithKey(key, operation, metadata);
  }

  static async executeWithKey(key: string, operation: () => Promise<any>, metadata?: Record<string, any>): Promise<any> {
    const normalizedKey = sanitizeKey(key);
    const partitionKey = buildPartitionKey(normalizedKey);

    const existing = await getRecord(partitionKey);
    if (existing) {
      if (existing.status === 'IN_PROGRESS') {
        return attachReplayHeader(inProgressResponse());
      }

      if (existing.response) {
        return attachReplayHeader(deserializeResponse(existing.response));
      }
    }

    const now = new Date().toISOString();
    const baseRecord: IdempotencyRecord = {
      pk: partitionKey,
      sk: IDEMPOTENCY_SORT_KEY,
      key: normalizedKey,
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
      ttl: ttlSeconds(),
      ...(metadata ? { metadata } : {})
    } as IdempotencyRecord;

    try {
      await putRecord(baseRecord, 'attribute_not_exists(pk)');
    } catch (error: any) {
      if (error?.name === 'ConditionalCheckFailedException') {
        const current = await getRecord(partitionKey);
        if (current?.response) {
          return attachReplayHeader(deserializeResponse(current.response));
        }
        return attachReplayHeader(inProgressResponse());
      }
      throw error;
    }

    try {
      const result = await operation();
      const normalized = normalizeResponse(result);

      const finalRecord: IdempotencyRecord = {
        ...baseRecord,
        status: 'COMPLETED',
        response: normalized,
        updatedAt: new Date().toISOString(),
        ttl: ttlSeconds()
      };

      await putRecord(finalRecord);
      return normalized;
    } catch (error) {
      const errorResponse = errorToResponse(error);
      const finalRecord: IdempotencyRecord = {
        ...baseRecord,
        status: 'FAILED',
        response: errorResponse,
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
        ttl: ttlSeconds()
      };

      await putRecord(finalRecord);
      return errorResponse;
    }
  }
}

export default IdempotencyService;
