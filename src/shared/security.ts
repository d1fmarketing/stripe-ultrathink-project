import { APIGatewayProxyEvent } from 'aws-lambda';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

interface CorsResult {
  headers: Record<string, string>;
  originAllowed: boolean;
}

const rateLimitBuckets: Map<string, { count: number; resetTime: number }> = new Map();

const fallbackAllowedOrigins = [
  'https://app.stripedshield.com',
  'https://stripedshield.com',
  'http://localhost:3000'
];

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const defaultAllowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : fallbackAllowedOrigins;

export function extractOrigin(event: Pick<APIGatewayProxyEvent, 'headers'>): string | undefined {
  const headers = event.headers || {};
  const originHeader = headers['origin'] || headers['Origin'] || headers['ORIGIN'];
  if (typeof originHeader === 'string') {
    return originHeader;
  }
  const refererHeader = headers['referer'] || headers['Referer'] || headers['REFERER'];
  if (typeof refererHeader === 'string') {
    try {
      const url = new URL(refererHeader);
      return url.origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function buildCorsHeaders(
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  allowedOrigins: string[] = defaultAllowedOrigins
): CorsResult {
  const origin = extractOrigin(event);
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  };

  if (!origin) {
    // Requests without an Origin header are typically server-to-server; allow but do not echo wildcard.
    headers['Access-Control-Allow-Origin'] = allowedOrigins[0] || '';
    return { headers, originAllowed: true };
  }

  const isAllowed = allowedOrigins.includes(origin);

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    return { headers, originAllowed: true };
  }

  headers['Access-Control-Allow-Origin'] = '';
  return { headers, originAllowed: false };
}

export function applyRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetTime <= now) {
    bucket = { count: 0, resetTime: now + options.windowMs };
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const allowed = bucket.count <= options.max;
  const remaining = Math.max(options.max - bucket.count, 0);

  return {
    allowed,
    remaining,
    resetTime: bucket.resetTime
  };
}

export function getClientIp(event: Pick<APIGatewayProxyEvent, 'headers' | 'requestContext'>): string {
  const headers = event.headers || {};
  const headerCandidates = [
    'x-forwarded-for',
    'X-Forwarded-For',
    'x-real-ip',
    'X-Real-IP'
  ];

  for (const header of headerCandidates) {
    const value = headers[header];
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',')[0].trim();
    }
  }

  const requestContext: any = (event as any).requestContext || {};
  const identity = requestContext.identity || {};
  if (typeof identity.sourceIp === 'string' && identity.sourceIp.length > 0) {
    return identity.sourceIp;
  }

  return 'unknown';
}

export function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailValid(value: string): boolean {
  return emailRegex.test(value);
}

export function logSecurityEvent(eventType: string, details: Record<string, unknown>): void {
  const safeDetails = { ...details };

  if (typeof safeDetails.email === 'string') {
    const email = safeDetails.email as string;
    const [user, domain] = email.split('@');
    safeDetails.email = user && domain ? `${user.slice(0, 2)}***@${domain}` : 'redacted';
  }

  if (typeof safeDetails.token === 'string') {
    safeDetails.token = 'redacted';
  }

  console.log(JSON.stringify({
    level: 'security',
    eventType,
    timestamp: new Date().toISOString(),
    ...safeDetails
  }));
}

export function applySecurityHeaders(
  headers: Record<string, string>,
  overrides: Record<string, string> = {},
  options: { rateLimitLimit?: number } = {}
): Record<string, string> {
  const merged: Record<string, string> = {
    ...headers,
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...overrides
  };

  if (typeof options.rateLimitLimit === 'number') {
    merged['X-RateLimit-Limit'] = options.rateLimitLimit.toString();
  }

  return merged;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
