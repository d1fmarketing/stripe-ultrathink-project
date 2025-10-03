import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import {
  applyRateLimit,
  applySecurityHeaders,
  buildCorsHeaders,
  getClientIp,
  isEmailValid,
  logSecurityEvent,
  requireEnv,
  sanitizeEmail
} from '../shared/security.js';

const JWT_EXPIRY = '7d'; // 7 days validity
const loginRateLimitWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? '60000');
const loginRateLimitMax = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? '5');
const allowPasswordlessDemo = process.env.ALLOW_PASSWORDLESS_DEMO_LOGIN === 'true';

interface LoginRequest {
  email: string;
  password?: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    email: string;
    merchantId: string;
    role: string;
    name: string;
  };
  expiresIn?: string;
  error?: string;
}

// Demo users for testing
const DEMO_USERS = [
  {
    email: 'demo@stripedshield.com',
    password: 'demo123',
    merchantId: 'demo_001',
    role: 'demo',
    name: 'Demo User'
  },
  {
    email: 'founder@stripedshield.com',
    password: 'founder2025',
    merchantId: 'founder_001',
    role: 'founder',
    name: 'Founder User'
  }
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  const cors = buildCorsHeaders(event);
  const baseHeaders: Record<string, string> = applySecurityHeaders({
    ...cors.headers,
    'Content-Type': 'application/json'
  }, {}, { rateLimitLimit: loginRateLimitMax });

  const withRemaining = (remaining: number, overrides: Record<string, string> = {}) =>
    applySecurityHeaders(baseHeaders, {
      'X-RateLimit-Remaining': Math.max(remaining, 0).toString(),
      ...overrides
    }, { rateLimitLimit: loginRateLimitMax });

  if (!cors.originAllowed) {
    logSecurityEvent('cors_blocked', {
      endpoint: 'authLoginHandler',
      originAttempted: event.headers?.origin || event.headers?.Origin || 'unknown',
      clientIp: getClientIp(event)
    });

    return {
      statusCode: 403,
      headers: baseHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Origin not allowed'
      })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: baseHeaders,
      body: ''
    };
  }

  try {
    const clientIp = getClientIp(event);
    const rateResult = applyRateLimit(`auth_login:${clientIp}`, {
      windowMs: loginRateLimitWindowMs,
      max: loginRateLimitMax
    });

    if (!rateResult.allowed) {
      logSecurityEvent('rate_limit_block', {
        endpoint: 'authLoginHandler',
        clientIp,
        resetTime: new Date(rateResult.resetTime).toISOString()
      });

      return {
        statusCode: 429,
        headers: applySecurityHeaders(baseHeaders, {
          'Retry-After': Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString(),
          'X-RateLimit-Remaining': '0'
        }, { rateLimitLimit: loginRateLimitMax }),
        body: JSON.stringify({
          success: false,
          error: 'Too many login attempts. Please try again later.'
        })
      };
    }

    let loginRequest: LoginRequest;

    try {
      loginRequest = JSON.parse(event.body || '{}');
      if (typeof loginRequest !== 'object' || loginRequest === null) {
        throw new Error('Invalid JSON structure');
      }
    } catch (error) {
      logSecurityEvent('invalid_request_body', {
        endpoint: 'authLoginHandler',
        clientIp,
        reason: 'JSON parse failure'
      });

      return {
        statusCode: 400,
        headers: withRemaining(rateResult.remaining),
        body: JSON.stringify({
          success: false,
          error: 'Invalid request body'
        })
      };
    }

    if (!loginRequest.email || typeof loginRequest.email !== 'string') {
      return {
        statusCode: 400,
        headers: withRemaining(rateResult.remaining),
        body: JSON.stringify({
          success: false,
          error: 'Email is required'
        })
      };
    }

    const email = sanitizeEmail(loginRequest.email);
    if (!isEmailValid(email)) {
      logSecurityEvent('invalid_email', {
        endpoint: 'authLoginHandler',
        clientIp
      });

      return {
        statusCode: 400,
        headers: withRemaining(rateResult.remaining),
        body: JSON.stringify({
          success: false,
          error: 'Email format is invalid'
        })
      };
    }

    const password = typeof loginRequest.password === 'string'
      ? loginRequest.password.trim()
      : undefined;

    if (password && password.length > 256) {
      return {
        statusCode: 400,
        headers: withRemaining(rateResult.remaining),
        body: JSON.stringify({
          success: false,
          error: 'Password is too long'
        })
      };
    }

    const jwtSecret = requireEnv('JWT_SECRET');

    const demoUser = DEMO_USERS.find(u => u.email === email);
    if (demoUser) {
      const passwordRequired = email !== 'demo@stripedshield.com' || !allowPasswordlessDemo;

      if (passwordRequired) {
        if (!password || password !== demoUser.password) {
          logSecurityEvent('authentication_failure', {
            endpoint: 'authLoginHandler',
            clientIp
          });

          return {
            statusCode: 401,
            headers: withRemaining(rateResult.remaining),
            body: JSON.stringify({
              success: false,
              error: 'Invalid email or password'
            })
          };
        }
      } else if (!password) {
        logSecurityEvent('demo_passwordless_login', {
          endpoint: 'authLoginHandler',
          clientIp
        });
      }

      const token = jwt.sign(
        {
          email: demoUser.email,
          merchantId: demoUser.merchantId,
          role: demoUser.role,
          name: demoUser.name,
          iat: Math.floor(Date.now() / 1000)
        },
        jwtSecret,
        {
          expiresIn: JWT_EXPIRY
        }
      );

      logSecurityEvent('authentication_success', {
        endpoint: 'authLoginHandler',
        clientIp,
        merchantId: demoUser.merchantId,
        responseTimeMs: Date.now() - startTime
      });

      const response: LoginResponse = {
        success: true,
        token,
        user: {
          email: demoUser.email,
          merchantId: demoUser.merchantId,
          role: demoUser.role,
          name: demoUser.name
        },
        expiresIn: JWT_EXPIRY
      };

      return {
        statusCode: 200,
        headers: withRemaining(rateResult.remaining),
        body: JSON.stringify(response)
      };
    }

    logSecurityEvent('authentication_failure', {
      endpoint: 'authLoginHandler',
      clientIp
    });

    return {
      statusCode: 401,
      headers: withRemaining(rateResult.remaining),
      body: JSON.stringify({
        success: false,
        error: 'Invalid email or password'
      })
    };
  } catch (error) {
    console.error('Error in auth login handler:', error);

    return {
      statusCode: 500,
      headers: applySecurityHeaders(baseHeaders, {}, { rateLimitLimit: loginRateLimitMax }),
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};
