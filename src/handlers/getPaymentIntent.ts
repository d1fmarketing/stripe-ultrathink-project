import { getStripeClient } from '../shared/stripeClient';

export async function handler(evt:any){
  const { charge, merchant:{stripe_account_id} } = evt;
  if(!charge?.payment_intent) return { ...evt, payment_intent: null };
  const stripe = await getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(charge.payment_intent as string, { stripeAccount: stripe_account_id });
  return { ...evt, payment_intent: pi };
}
