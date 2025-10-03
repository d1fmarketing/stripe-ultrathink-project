import Stripe from 'stripe';
import { withErrorHandling } from "../shared/errorHandling.js";
const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });

async function baseHandler(evt:any){
  const { charge, merchant:{stripe_account_id} } = evt;
  if(!charge?.payment_intent) return { ...evt, payment_intent: null };
  const pi = await stripe.paymentIntents.retrieve(charge.payment_intent as string, { stripeAccount: stripe_account_id });
  return { ...evt, payment_intent: pi };
}

export const handler = withErrorHandling('getPaymentIntent', baseHandler);
