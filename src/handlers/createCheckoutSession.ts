import Stripe from 'stripe';
import { ok, bad } from "../shared/responses.js";
import { requireAuth } from "../shared/auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });

export async function handler(event: any) {
  // Get auth context if user is logged in (optional for checkout)
  let authContext = null;
  try {
    const authResult = await requireAuth(event);
    if (!('statusCode' in authResult)) {
      authContext = authResult;
    }
  } catch (e) {
    // User not logged in, that's okay for checkout
  }
  
  const body = JSON.parse(event.body || '{}');
  const email = body.email || authContext?.email;
  const priceId = body.price_id || process.env.STRIPE_PRICE_ID || 'price_1QWtQxDOwkStzJVXK8PqXJ0z'; // Default founder price
  
  if (!email) {
    return bad('Email is required');
  }
  
  try {
    // Create or retrieve customer
    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    });
    
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email,
        metadata: {
          firebase_uid: authContext?.uid || '',
          source: 'stripedshield_checkout'
        }
      });
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          firebase_uid: authContext?.uid || '',
          merchant_id: authContext?.merchant_id || ''
        }
      },
      success_url: 'https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html?payment=success',
      cancel_url: 'https://stripedshield-founders-1755231149.netlify.app/checkout.html?payment=cancelled',
      client_reference_id: authContext?.uid || email, // Link to Firebase user
      metadata: {
        firebase_uid: authContext?.uid || '',
        email: email
      }
    });
    
    return ok({ 
      checkout_url: session.url,
      session_id: session.id
    });
    
  } catch (error: any) {
    console.error('Checkout session error:', error);
    return bad(error.message);
  }
}