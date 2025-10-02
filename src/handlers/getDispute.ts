import Stripe from 'stripe';
import { getMerchantByAccount, upsertCase } from "../shared/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });

export async function handler(evt:any){
  const { dispute_id, merchant: { stripe_account_id } } = evt;
  const merchant = await getMerchantByAccount(stripe_account_id);
  const d = await stripe.disputes.retrieve(dispute_id, { stripeAccount: stripe_account_id });
  const tMinus = d.evidence_details?.due_by ? new Date((d.evidence_details.due_by*1000) - (48*3600*1000)).toISOString() : null;
  await upsertCase(stripe_account_id, d, {});
  return { ...evt, dispute: d, merchant, "dispute.evidence_details.due_by_minus_48h": tMinus };
}
