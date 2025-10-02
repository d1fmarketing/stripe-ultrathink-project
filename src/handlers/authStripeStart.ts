import crypto from 'crypto';
import { ok, bad } from "../shared/responses.js";
import { env } from "../shared/env.js";

const STRIPE_CLIENT_ID = env.STRIPE_CLIENT_ID;
const STRIPE_REDIRECT_URI = env.STRIPE_REDIRECT_URI;

export async function handler(event: any){
  if(!STRIPE_CLIENT_ID || !STRIPE_REDIRECT_URI) return bad("Stripe not configured");
  
  // Get Firebase UID from query parameters to link accounts
  const qs = event.queryStringParameters || {};
  const firebase_uid = qs.uid || qs.firebase_uid || null;
  
  // Create state with Firebase UID and CSRF token
  const stateData = {
    firebase_uid,
    csrf: crypto.randomBytes(16).toString('hex'),
    timestamp: Date.now()
  };
  
  // Encode state as base64 for URL safety
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
  
  const params = new URLSearchParams({
    response_type: 'code', 
    client_id: STRIPE_CLIENT_ID, 
    scope: 'read_write',
    redirect_uri: STRIPE_REDIRECT_URI, 
    state
  }).toString();
  
  // Return 302 redirect instead of 200 with URL
  return {
    statusCode: 302,
    headers: {
      'Location': `https://connect.stripe.com/oauth/authorize?${params}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: ''
  };
}
