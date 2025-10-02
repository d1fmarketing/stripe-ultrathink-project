// Complete set of security headers
const securityHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Requested-With,X-Request-ID',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  // Security headers
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.firebaseio.com",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=*, usb=()'
};

export const ok = (body:any) => ({
  statusCode: 200,
  headers: securityHeaders,
  body: JSON.stringify(body)
});

export const created = (body:any) => ({
  statusCode: 201,
  headers: securityHeaders,
  body: JSON.stringify(body)
});

export const bad = (msg:string) => ({
  statusCode: 400,
  headers: securityHeaders,
  body: JSON.stringify({ error: msg })
});

export const createErrorResponse = (
  statusCode: number,
  message: string,
  details?: any,
  extraHeaders?: Record<string, string>
) => ({
  statusCode,
  headers: { ...securityHeaders, ...(extraHeaders ?? {}) },
  body: JSON.stringify({
    error: message,
    ...details
  })
});
