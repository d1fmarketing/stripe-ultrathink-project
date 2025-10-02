import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { getRequestOrigin, handleCorsPreflight, jsonResponse } from '../shared/responses.js';

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const origin = getRequestOrigin(event);

  const preflight = handleCorsPreflight(event, 'POST,OPTIONS');
  if (preflight) {
    return preflight;
  }

  try {
    // Parse request body
    let loginRequest: LoginRequest;
    
    try {
      loginRequest = JSON.parse(event.body || '{}');
    } catch (error) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid request body'
      }, { origin });
    }

    // Validate email
    if (!loginRequest.email) {
      return jsonResponse(400, {
        success: false,
        error: 'Email is required'
      }, { origin });
    }

    // Normalize email
    const email = loginRequest.email.toLowerCase().trim();
    
    // Check for demo users
    const demoUser = DEMO_USERS.find(u => u.email === email);
    
    // For demo purposes, allow access with just email for demo@stripedshield.com
    // In production, always require password
    if (email === 'demo@stripedshield.com') {
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

      return jsonResponse(200, response, { origin });
    }

    // For other users, check password
    if (demoUser) {
      // Validate password
      if (!loginRequest.password || loginRequest.password !== demoUser.password) {
        return jsonResponse(401, {
          success: false,
          error: 'Invalid email or password'
        }, { origin });
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

      return jsonResponse(200, response, { origin });
    }

    // For production, would check against DynamoDB
    // For now, return error for unknown users
    return jsonResponse(401, {
      success: false,
      error: 'Invalid email or password'
    }, { origin });

  } catch (error) {
    console.error('Error in auth login handler:', error);
    
    return jsonResponse(500, {
      success: false,
      error: 'Internal server error'
    }, { origin });
  }
};