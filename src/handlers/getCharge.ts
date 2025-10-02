import { getStripeClient } from '../shared/stripeClient';

export async function handler(evt:any){
  // Safely extract stripe_account_id with proper error handling
  const { dispute, merchant } = evt;
  
  if (!dispute || !dispute.charge) {
    console.error('Missing dispute or charge in event:', evt);
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'Missing dispute or charge information' }) 
    };
  }
  
  const stripe_account_id = merchant?.stripe_account_id;
  const chargeId = (dispute.charge as string);
  
  try {
    const stripe = await getStripeClient();
    // Retrieve charge with optional connected account
    const ch = stripe_account_id
      ? await stripe.charges.retrieve(chargeId, { stripeAccount: stripe_account_id })
      : await stripe.charges.retrieve(chargeId);
      
    return { ...evt, charge: ch };
  } catch (error: any) {
    console.error('Error retrieving charge:', error.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to retrieve charge', details: error.message }) 
    };
  }
}
