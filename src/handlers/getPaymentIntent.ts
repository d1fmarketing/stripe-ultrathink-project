import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });

export async function handler(evt:any){
  const { charge, merchant:{stripe_account_id} } = evt;
  if(!charge?.payment_intent) return { ...evt, payment_intent: null };
  const pi = await stripe.paymentIntents.retrieve(charge.payment_intent as string, { stripeAccount: stripe_account_id });
  return { ...evt, payment_intent: pi };
}
