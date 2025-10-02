import crypto from 'crypto';
import { bad, getRequestOrigin, handleCorsPreflight, redirect } from "../shared/responses.js";

const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID!;
const STRIPE_REDIRECT_URI = process.env.STRIPE_REDIRECT_URI!;

export async function handler(event: any){
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'GET,OPTIONS');
  if (preflight) return preflight;

  if(!STRIPE_CLIENT_ID || !STRIPE_REDIRECT_URI) return bad("Stripe not configured", { origin });
  
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
  return redirect(
    `https://connect.stripe.com/oauth/authorize?${params}`,
    302,
    {
      origin,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }
  );
}
