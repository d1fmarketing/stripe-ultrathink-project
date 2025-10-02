import { ddb } from "./ddb.js";
import { PutCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "./env.js";

const MERCHANTS = env.MERCHANTS_TABLE;
const CASES = env.CASES_TABLE;

export async function putMerchant(m:any){
  // Use stripe_account_id as the primary key for consistency
  const merchant_id = m.stripe_account_id || m.merchant_id;
  const item = {
    pk: `MERCHANT#${merchant_id}`,
    merchant_id: merchant_id,
    stripe_account_id: merchant_id, // Ensure both fields are set
    ...m,
    created_at: m.created_at || new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: MERCHANTS, Item: item }));
}

export async function getMerchantByAccount(stripe_account_id:string){
  const pk = `MERCHANT#${stripe_account_id}`;
  const r = await ddb.send(new GetCommand({ TableName: MERCHANTS, Key: { pk } }));
  return r.Item || { pk, merchant_id: stripe_account_id, stripe_account_id, settings: { autoSubmit: true, autoAcceptBelowCents: 0, retentionDays: 540, notifyEmails: [] } };
}

export async function upsertCase(merchantId:string, dispute:any, extras:any={}){
  const now = Math.floor(Date.now()/1000);
  const item = {
    pk: `MERCHANT#${merchantId}`,
    sk: `CASE#${dispute.id}`,
    dispute_id: dispute.id,
    charge_id: dispute.charge,
    payment_intent_id: dispute.payment_intent,
    amount_cents: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    created_at_epoch: dispute.created || now,
    updated_at_epoch: now,
    result_at_epoch: (['won','lost'].includes(dispute.status) ? now : undefined),
    due_by_epoch: dispute.evidence_details?.due_by || null,
    gsi1_pk: dispute.evidence_details?.due_by ? new Date((dispute.evidence_details.due_by*1000)).toISOString().slice(0,10).replace(/-/g,'') : 'NA',
    gsi1_sk: dispute.evidence_details?.due_by || 0,
    gsi2_pk: `STATUS#${dispute.status}`,
    gsi2_sk: dispute.evidence_details?.due_by || 0,
    ...extras
  };
  await ddb.send(new PutCommand({ TableName: CASES, Item: item }));
  return item;
}

export async function listCases(merchantId:string, status?:string){
  const pk = `MERCHANT#${merchantId}`;
  const r = await ddb.send(new QueryCommand({
    TableName: CASES,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": pk }
  }));
  let items = r.Items || [];
  if(status) items = items.filter(i => i.status === status);
  return items.sort((a,b) => (a.due_by_epoch||0)-(b.due_by_epoch||0));
}

export async function getCase(merchantId:string, disputeId:string){
  const pk = `MERCHANT#${merchantId}`, sk = `CASE#${disputeId}`;
  const r = await ddb.send(new GetCommand({ TableName: CASES, Key: { pk, sk } }));
  return r.Item;
}

export async function scanMerchants(){
  const r = await ddb.send(new ScanCommand({ TableName: MERCHANTS }));
  return r.Items || [];
}
