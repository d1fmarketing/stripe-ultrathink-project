import Stripe from 'stripe';
import { stripeCircuitBreaker } from '../shared/circuitBreaker.js';

export async function handler(evt:any){
  const { dispute, evidence, merchant } = evt;
  
  // Use merchant's OAuth token for connected accounts, fallback to global secret with stripeAccount header
  let stripe: Stripe;
  let stripeOptions: any = {};
  
  if (merchant?.access_token) {
    // OAuth connected account - use access token directly
    stripe = new Stripe(merchant.access_token, { apiVersion:'2025-07-30.basil' });
  } else if (merchant?.stripe_account_id) {
    // Standard connected account - use global secret with stripeAccount header
    stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });
    stripeOptions = { stripeAccount: merchant.stripe_account_id };
  } else {
    // Direct account - use global secret
    stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });
  }
  
  const res = await stripeCircuitBreaker(
    'disputes.update',
    () => stripe.disputes.update(dispute.id, { evidence, submit: false }, stripeOptions),
    {
      failureThreshold: 3,
      cooldownPeriod: 120_000
    }
  );
  return { ...evt, staged: true, dispute: res };
}
