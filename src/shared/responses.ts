const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Authorization,Content-Type,X-Requested-With,X-Request-ID';

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowAnyOrigin = configuredOrigins.includes('*');

const resolveAllowedOrigin = (requestOrigin?: string | null) => {
  if (allowAnyOrigin) {
    return '*';
  }

  if (requestOrigin && configuredOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Fall back to the first configured origin or wildcard if nothing provided
  return configuredOrigins[0] || '*';
};

export const getRequestOrigin = (event?: { headers?: Record<string, string | undefined> } | null) => {
  if (!event?.headers) return null;
  const headers = event.headers;
  return (
    headers.origin ||
    headers.Origin ||
    headers['x-forwarded-origin'] ||
    headers['X-Forwarded-Origin'] ||
    null
  );
};

export const withSecurityHeaders = (
  extraHeaders: Record<string, string> = {},
  requestOrigin?: string | null
) => {
  const allowedOrigin = resolveAllowedOrigin(requestOrigin);

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': process.env.ALLOWED_HEADERS || DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': process.env.ALLOWED_METHODS || DEFAULT_ALLOWED_METHODS,
    'Access-Control-Allow-Credentials': allowedOrigin === '*' ? 'false' : 'true',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.firebaseio.com",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    'X-DNS-Prefetch-Control': 'off'
  };

  return {
    ...baseHeaders,
    ...extraHeaders
  };
};

export interface ResponseOptions {
  headers?: Record<string, string>;
  origin?: string | null;
  rawBody?: boolean;
}

const buildBody = (body: any, rawBody?: boolean) => {
  if (rawBody) {
    return typeof body === 'string' ? body : '';
  }
  return JSON.stringify(body);
};

export const jsonResponse = (statusCode: number, body: any, options: ResponseOptions = {}) => ({
  statusCode,
  headers: withSecurityHeaders(options.headers || {}, options.origin),
  body: buildBody(body, options.rawBody)
});

export const ok = (body: any, options?: ResponseOptions) => jsonResponse(200, body, options);

export const created = (body: any, options?: ResponseOptions) => jsonResponse(201, body, options);

export const bad = (msg: string, options?: ResponseOptions) =>
  jsonResponse(400, { error: msg }, options);

export const createErrorResponse = (
  statusCode: number,
  message: string,
  details?: any,
  options?: ResponseOptions
) => jsonResponse(statusCode, { error: message, ...details }, options);

export const noContent = (options?: ResponseOptions & { statusCode?: number }) => ({
  statusCode: options?.statusCode ?? 204,
  headers: withSecurityHeaders(options?.headers || {}, options?.origin),
  body: ''
});

export const redirect = (
  location: string,
  statusCode = 302,
  options?: ResponseOptions
) => jsonResponse(
  statusCode,
  '',
  {
    ...options,
    rawBody: true,
    headers: {
      'Location': location,
      'Content-Type': 'text/plain; charset=utf-8',
      ...(options?.headers || {})
    }
  }
);

export const handleCorsPreflight = (
  event: { httpMethod?: string | null; requestContext?: any; headers?: Record<string, string | undefined> | undefined } | null | undefined,
  allowedMethods: string = DEFAULT_ALLOWED_METHODS
) => {
  const method =
    event?.httpMethod ||
    event?.requestContext?.http?.method ||
    event?.requestContext?.httpMethod ||
    '';

  if (method.toUpperCase() !== 'OPTIONS') {
    return null;
  }

  const origin = getRequestOrigin(event);
  return noContent({
    headers: {
      'Access-Control-Allow-Methods': allowedMethods,
      'Content-Type': 'text/plain; charset=utf-8'
    },
    origin
  });
};

export const securityHeaders = withSecurityHeaders();
