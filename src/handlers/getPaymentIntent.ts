import Stripe from 'stripe';
import { setCorrelationContext, withRequestLogging } from "../shared/logger.js";
const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });

export const handler = withRequestLogging(async (evt:any) => {
  const { charge, merchant:{stripe_account_id} } = evt;
  setCorrelationContext({ merchantId: stripe_account_id });
  if(!charge?.payment_intent) return { ...evt, payment_intent: null };
  const pi = await stripe.paymentIntents.retrieve(charge.payment_intent as string, { stripeAccount: stripe_account_id });
  return { ...evt, payment_intent: pi };
});
