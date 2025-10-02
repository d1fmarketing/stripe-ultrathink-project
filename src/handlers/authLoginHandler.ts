import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withRequestResponseValidation } from "../shared/httpValidation.js";

const JWT_SECRET = process.env.JWT_SECRET || 'stripedshield-demo-secret-2025';
const JWT_EXPIRY = '7d'; // 7 days validity

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

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128).optional()
});

const loginResponseSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  user: z.object({
    email: z.string().email(),
    merchantId: z.string(),
    role: z.string(),
    name: z.string()
  }).optional(),
  expiresIn: z.string().optional(),
  error: z.string().optional()
}).passthrough();

export const handler = withRequestResponseValidation(
async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const loginRequest = (event as typeof event & { validatedBody?: LoginRequest }).validatedBody;
    if (!loginRequest) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid request body'
        })
      };
    }

    // Normalize email
    const email = loginRequest.email.toLowerCase().trim();

    // Check for demo users
    const demoUser = DEMO_USERS.find(u => u.email === email);

    // For demo purposes, allow access with just email for demo@stripedshield.com
    // In production, always require password
    if (email === 'demo@stripedshield.com' && demoUser) {
      // Generate JWT token
      const token = jwt.sign(
        {
          email: demoUser.email,
          merchantId: demoUser.merchantId,
          role: demoUser.role,
          name: demoUser.name,
          iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        {
          expiresIn: JWT_EXPIRY
        }
      );

      console.log(`Demo login successful for ${email}`);

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
        headers,
        body: JSON.stringify(response)
      };
    }

    // For other users, check password
    if (demoUser) {
      // Validate password
      if (!loginRequest.password || loginRequest.password !== demoUser.password) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Invalid email or password'
          })
        };
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          email: demoUser.email,
          merchantId: demoUser.merchantId,
          role: demoUser.role,
          name: demoUser.name,
          iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        {
          expiresIn: JWT_EXPIRY
        }
      );

      console.log(`Login successful for ${email}`);

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
        headers,
        body: JSON.stringify(response)
      };
    }

    // For production, would check against DynamoDB
    // For now, return error for unknown users
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Invalid email or password'
      })
    };

  } catch (error) {
    console.error('Error in auth login handler:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
}, {
  bodySchema: loginRequestSchema,
  responseSchema: loginResponseSchema
});
