import admin from 'firebase-admin';
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./ddb.js";
import { createErrorResponse, getRequestOrigin } from "./responses.js";

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;

function initFirebaseAdmin() {
  if (!firebaseApp) {
    try {
      // Use service account from environment (loaded from SSM)
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "stripecharge-b27a6"
        });
        console.log('Firebase Admin initialized with service account');
      } else {
        // Fallback: Initialize with project ID only (limited functionality)
        console.warn('No Firebase service account found, using limited initialization');
        firebaseApp = admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || "stripecharge-b27a6"
        });
      }
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
      throw new Error('Firebase Admin initialization failed');
    }
  }
  return firebaseApp;
}

export interface AuthContext {
  uid: string;
  email: string;
  merchant_id?: string;
  stripe_account_id?: string;
  firebase_token: string;
}

/**
 * Validates Firebase ID token and returns user context
 */
export async function validateAuth(authHeader: string | undefined): Promise<AuthContext | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No valid auth header');
    return null;
  }

  const token = authHeader.substring(7);
  
  try {
    const app = initFirebaseAdmin();
    const decodedToken = await admin.auth(app).verifyIdToken(token);
    
    // Get merchant info from DynamoDB if exists
    let merchantInfo = null;
    try {
      // Try to find merchant by firebase_uid
      const result = await ddb.send(new GetCommand({
        TableName: process.env.MERCHANTS_TABLE!,
        Key: { pk: `USER#${decodedToken.uid}` }
      }));
      
      if (result.Item) {
        merchantInfo = result.Item;
      }
    } catch (e) {
      // No merchant record yet, that's okay
      console.log('No merchant record for user:', decodedToken.uid);
    }
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      merchant_id: merchantInfo?.merchant_id,
      stripe_account_id: merchantInfo?.stripe_account_id,
      firebase_token: token
    };
  } catch (error) {
    console.error('Auth validation error:', error);
    return null;
  }
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(event: any): Promise<AuthContext | { statusCode: number; headers: Record<string, string>; body: string }> {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const authContext = await validateAuth(authHeader);

  if (!authContext) {
    return createErrorResponse(401, 'Unauthorized', undefined, { origin: getRequestOrigin(event) });
  }

  return authContext;
}

/**
 * Check if user owns the merchant account
 */
export async function verifyMerchantOwnership(
  authContext: AuthContext, 
  merchantId: string
): Promise<boolean> {
  // Check if this is the user's merchant account
  if (authContext.merchant_id === merchantId || 
      authContext.stripe_account_id === merchantId) {
    return true;
  }
  
  // Double-check in database
  try {
    const result = await ddb.send(new GetCommand({
      TableName: process.env.MERCHANTS_TABLE!,
      Key: { pk: `MERCHANT#${merchantId}` }
    }));
    
    if (result.Item?.firebase_uid === authContext.uid) {
      return true;
    }
  } catch (e) {
    console.error('Error checking merchant ownership:', e);
  }
  
  return false;
}