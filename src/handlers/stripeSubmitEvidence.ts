import Stripe from 'stripe';
import { env } from '../shared/env.js';

export async function handler(evt:any){
  const { dispute, merchant } = evt;
  
  // Use merchant's OAuth token for connected accounts, fallback to global secret with stripeAccount header
  let stripe: Stripe;
  let stripeOptions: any = {};
  
  if (merchant?.access_token) {
    // OAuth connected account - use access token directly
    stripe = new Stripe(merchant.access_token, { apiVersion:'2025-07-30.basil' });
  } else if (merchant?.stripe_account_id) {
    // Standard connected account - use global secret with stripeAccount header
    stripe = new Stripe(env.STRIPE_SECRET, { apiVersion:'2025-07-30.basil' });
    stripeOptions = { stripeAccount: merchant.stripe_account_id };
  } else {
    // Direct account - use global secret
    stripe = new Stripe(env.STRIPE_SECRET, { apiVersion:'2025-07-30.basil' });
  }
  
  const res = await stripe.disputes.update(dispute.id, { submit: true }, stripeOptions);
  return { submitted: true, dispute: res };
}
