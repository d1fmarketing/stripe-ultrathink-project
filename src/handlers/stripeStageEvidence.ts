import Stripe from 'stripe';
import { setCorrelationContext, withRequestLogging } from "../shared/logger.js";

export const handler = withRequestLogging(async (evt:any) => {
  const { dispute, evidence, merchant } = evt;

  if (merchant?.stripe_account_id || merchant?.merchant_id) {
    setCorrelationContext({ merchantId: merchant.stripe_account_id || merchant.merchant_id });
  }
  
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
  
  const res = await stripe.disputes.update(dispute.id, { evidence, submit: false }, stripeOptions);
  return { ...evt, staged: true, dispute: res };
});
